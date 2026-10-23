import { isPublicKey, isSignedEnvelope, type Framework, type PairResponse, type PendingResponse, type PublicKey, type SignedEnvelope } from "./protocol.ts";
import { checkPolicy, renderConfig } from "./policy.ts";
import { verifyEnvelope } from "./verify.ts";

/*
 * El agente, sin nada de FiveM dentro: todo lo que toca el mundo exterior entra por `AgentIO`.
 * Así se prueba en Node con un API falso y firmas reales, y la capa de FiveM (src/fivem) solo
 * traduce natives.
 */
export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}
export interface HttpResponse {
  status: number;
  body: string;
}

export interface AgentIO {
  http(request: HttpRequest): Promise<HttpResponse>;
  /** Lee un fichero de un recurso; null si no existe. */
  readFile(resource: string, file: string): string | null;
  writeFile(resource: string, file: string, data: string): boolean;
  /** "started" | "stopped" | "missing" | otros estados de FiveM. */
  resourceState(resource: string): string;
  restart(resource: string): void;
  log(level: "info" | "warn" | "error", message: string): void;
  now(): Date;
}

export interface AgentState {
  serverId: string;
  token: string;
  publicKeys: PublicKey[];
  /** Últimos ids aplicados: un paquete repetido no se aplica dos veces. */
  applied: string[];
}

export interface AgentOptions {
  apiOrigin: string;
  agentVersion: string;
  /** Recurso propio, donde se guarda el estado. */
  selfResource: string;
  stateFile?: string;
  detectFramework?: () => Framework;
  hostname?: () => string | undefined;
  /** Sobrescribe la lista blanca (solo tests). */
  allowedResources?: readonly string[];
}

const MAX_APPLIED_REMEMBERED = 200;

export class Agent {
  readonly #io: AgentIO;
  readonly #opt: Required<Pick<AgentOptions, "apiOrigin" | "agentVersion" | "selfResource" | "stateFile">> & AgentOptions;
  #state: AgentState | null = null;

  constructor(io: AgentIO, options: AgentOptions) {
    this.#io = io;
    this.#opt = { stateFile: "state.json", ...options, apiOrigin: options.apiOrigin.replace(/\/$/, "") };
    this.#state = this.#loadState();
  }

  get paired(): boolean {
    return this.#state !== null;
  }

  get serverId(): string | null {
    return this.#state?.serverId ?? null;
  }

  /* ── Estado en disco (dentro del propio recurso) ── */

  #loadState(): AgentState | null {
    const raw = this.#io.readFile(this.#opt.selfResource, this.#opt.stateFile);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<AgentState>;
      if (typeof parsed.serverId !== "string" || typeof parsed.token !== "string" || !Array.isArray(parsed.publicKeys)) return null;
      return {
        serverId: parsed.serverId,
        token: parsed.token,
        publicKeys: parsed.publicKeys.filter(isPublicKey),
        applied: Array.isArray(parsed.applied) ? parsed.applied.filter((id): id is string => typeof id === "string") : [],
      };
    } catch {
      this.#io.log("warn", "El fichero de estado está dañado; hay que volver a emparejar.");
      return null;
    }
  }

  #saveState(): void {
    if (!this.#state) return;
    const ok = this.#io.writeFile(this.#opt.selfResource, this.#opt.stateFile, `${JSON.stringify(this.#state, null, 2)}\n`);
    if (!ok) this.#io.log("error", "No se pudo guardar el estado del agente en el recurso.");
  }

  /** Olvida el token y las claves (p. ej. cuando el API dice que el token ya no vale). */
  unpair(): void {
    this.#state = null;
    this.#io.writeFile(this.#opt.selfResource, this.#opt.stateFile, "{}\n");
  }

  /* ── HTTP ── */

  async #call(method: "GET" | "POST", path: string, body?: unknown, auth = true): Promise<HttpResponse> {
    const headers: Record<string, string> = { accept: "application/json", "user-agent": `gente-agent/${this.#opt.agentVersion}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (auth) {
      if (!this.#state) throw new Error("El agente no está emparejado.");
      headers["authorization"] = `Bearer ${this.#state.token}`;
    }
    return this.#io.http({ method, url: `${this.#opt.apiOrigin}${path}`, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  static #errorMessage(response: HttpResponse): string {
    try {
      const parsed = JSON.parse(response.body) as { error?: { message?: string } };
      return parsed.error?.message ?? `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }

  /* ── Emparejamiento ── */

  async pair(code: string): Promise<{ ok: true; serverId: string } | { ok: false; message: string }> {
    const response = await this.#call(
      "POST",
      "/agent/pair",
      { code, agentVersion: this.#opt.agentVersion, framework: this.#opt.detectFramework?.(), hostname: this.#opt.hostname?.() },
      false,
    );
    if (response.status !== 201) return { ok: false, message: Agent.#errorMessage(response) };
    const data = JSON.parse(response.body) as PairResponse;
    if (typeof data.serverId !== "string" || typeof data.token !== "string" || !Array.isArray(data.publicKeys)) return { ok: false, message: "Respuesta de emparejamiento con forma inesperada." };
    this.#state = { serverId: data.serverId, token: data.token, publicKeys: data.publicKeys.filter(isPublicKey), applied: [] };
    this.#saveState();
    this.#io.log("info", `Emparejado con Studio (servidor ${data.serverId}).`);
    return { ok: true, serverId: data.serverId };
  }

  /* ── Latido y claves ── */

  async heartbeat(): Promise<void> {
    if (!this.#state) return;
    const response = await this.#call("POST", "/agent/heartbeat", { agentVersion: this.#opt.agentVersion, framework: this.#opt.detectFramework?.() });
    if (response.status === 401) this.#handleRevoked();
  }

  async refreshKeys(): Promise<void> {
    if (!this.#state) return;
    const response = await this.#call("GET", "/agent/keys", undefined, false);
    if (response.status !== 200) return;
    const data = JSON.parse(response.body) as { publicKeys?: unknown[] };
    const keys = (data.publicKeys ?? []).filter(isPublicKey);
    if (keys.length) {
      this.#state.publicKeys = keys;
      this.#saveState();
    }
  }

  #handleRevoked(): void {
    this.#io.log("warn", "Studio ha revocado este servidor: el agente queda sin emparejar. Genera un código nuevo en Studio.");
    this.unpair();
  }

  /* ── Publicaciones ── */

  /** Una pasada: pide pendientes, aplica cada sobre e informa. Devuelve cuántos se procesaron. */
  async pollOnce(): Promise<number> {
    if (!this.#state) return 0;
    const response = await this.#call("GET", "/agent/pending");
    if (response.status === 401) {
      this.#handleRevoked();
      return 0;
    }
    if (response.status !== 200) {
      this.#io.log("warn", `Studio respondió ${response.status} al pedir publicaciones pendientes.`);
      return 0;
    }
    let data: PendingResponse;
    try {
      data = JSON.parse(response.body) as PendingResponse;
    } catch {
      this.#io.log("warn", "Respuesta de pendientes ilegible.");
      return 0;
    }
    const envelopes = Array.isArray(data.publications) ? data.publications : [];
    let processed = 0;
    for (const raw of envelopes) {
      if (!isSignedEnvelope(raw)) {
        this.#io.log("warn", "Se descartó una publicación con forma inesperada.");
        continue;
      }
      await this.#process(raw);
      processed += 1;
    }
    return processed;
  }

  async #process(envelope: SignedEnvelope): Promise<void> {
    const state = this.#state;
    if (!state) return;
    const pkg = envelope.package;
    const id = pkg.id;

    if (state.applied.includes(id)) {
      // Ya aplicada en una pasada anterior y el informe no llegó: solo se repite el informe.
      await this.#report(id, "applied");
      return;
    }

    // Una clave desconocida puede ser una rotación: se refrescan las públicas una vez antes de rechazar.
    if (!state.publicKeys.some((k) => k.kid === envelope.kid)) await this.refreshKeys();
    if (!verifyEnvelope(envelope, this.#state?.publicKeys ?? [])) {
      await this.#reject(id, "firma no válida");
      return;
    }
    const policy = checkPolicy(pkg, state.serverId, this.#io.now(), this.#opt.allowedResources);
    if (!policy.ok) {
      await this.#reject(id, policy.reason);
      return;
    }

    const { resourceName, configFile } = pkg.product;
    const resourceState = this.#io.resourceState(resourceName);
    if (resourceState === "missing") {
      await this.#reject(id, `el recurso ${resourceName} no está instalado en este servidor`);
      return;
    }
    if (!this.#io.writeFile(resourceName, configFile, renderConfig(pkg.config))) {
      await this.#reject(id, `no se pudo escribir ${resourceName}/${configFile}`);
      return;
    }
    this.#io.log("info", `Publicación ${id}: escrito ${resourceName}/${configFile}.`);

    if (pkg.applyMode === "now") {
      if (resourceState === "started") {
        this.#io.restart(resourceName);
        this.#io.log("info", `Publicación ${id}: ${resourceName} reiniciado.`);
      } else {
        this.#io.log("info", `Publicación ${id}: ${resourceName} está ${resourceState}; la configuración entrará cuando arranque.`);
      }
    } else {
      this.#io.log("info", `Publicación ${id}: se aplicará cuando ${resourceName} se reinicie.`);
    }

    state.applied = [...state.applied.slice(-(MAX_APPLIED_REMEMBERED - 1)), id];
    this.#saveState();
    await this.#report(id, "applied");
  }

  async #reject(id: string, reason: string): Promise<void> {
    this.#io.log("warn", `Publicación ${id} rechazada: ${reason}.`);
    await this.#report(id, "failed", reason);
  }

  async #report(id: string, status: "applied" | "failed", error?: string): Promise<void> {
    const response = await this.#call("POST", `/agent/publications/${encodeURIComponent(id)}/report`, error ? { status, error } : { status });
    if (response.status !== 200) this.#io.log("warn", `Studio respondió ${response.status} al informar de la publicación ${id}.`);
  }
}
