import { createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { canonicalize } from "../src/core/canonical.ts";
import type { AgentIO, HttpRequest, HttpResponse } from "../src/core/agent.ts";
import type { PublicKey, PublishPackage, SignedEnvelope } from "../src/core/protocol.ts";

/* Un API de Studio falso: firma con una clave real y responde a las rutas que usa el agente. */
export class FakeStudio {
  readonly #privateKey: KeyObject;
  readonly publicKeys: PublicKey[];
  readonly reports: { id: string; status: string; error?: string }[] = [];
  pending: SignedEnvelope[] = [];
  pairCodes = new Map<string, string>();
  revoked = false;

  constructor(kid = "test-1") {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    this.#privateKey = privateKey;
    const der = publicKey.export({ type: "spki", format: "der" });
    this.publicKeys = [{ kid, alg: "ed25519", spkiDerBase64: der.toString("base64"), rawBase64: der.subarray(12).toString("base64") }];
  }

  rotate(kid: string): void {
    const { publicKey } = generateKeyPairSync("ed25519");
    void publicKey;
    this.publicKeys.unshift({ ...this.publicKeys[0]!, kid });
  }

  sign(pkg: PublishPackage, kid = this.publicKeys[0]!.kid): SignedEnvelope {
    const signature = sign(null, Buffer.from(canonicalize(pkg), "utf8"), this.#privateKey);
    return { package: pkg, signature: signature.toString("base64"), kid, alg: "ed25519" };
  }

  /** Firma con otra clave que no está publicada: debe rechazarse. */
  signWithImpostor(pkg: PublishPackage): SignedEnvelope {
    const { privateKey } = generateKeyPairSync("ed25519");
    const signature = sign(null, Buffer.from(canonicalize(pkg), "utf8"), privateKey);
    return { package: pkg, signature: signature.toString("base64"), kid: this.publicKeys[0]!.kid, alg: "ed25519" };
  }

  async handle(request: HttpRequest): Promise<HttpResponse> {
    const url = new URL(request.url);
    const authed = request.headers["authorization"] === "Bearer token-1" && !this.revoked;
    if (url.pathname === "/agent/pair" && request.method === "POST") {
      const body = JSON.parse(request.body ?? "{}") as { code: string };
      const serverId = this.pairCodes.get(body.code);
      if (!serverId) return { status: 404, body: JSON.stringify({ error: { code: "not_found", message: "Código de emparejamiento válido no encontrado." } }) };
      return { status: 201, body: JSON.stringify({ serverId, token: "token-1", publicKeys: this.publicKeys }) };
    }
    if (url.pathname === "/agent/keys") return { status: 200, body: JSON.stringify({ publicKeys: this.publicKeys }) };
    if (!authed) return { status: 401, body: JSON.stringify({ error: { code: "unauthorized", message: "Token de agente no válido o revocado." } }) };
    if (url.pathname === "/agent/heartbeat") return { status: 200, body: JSON.stringify({ ok: true }) };
    if (url.pathname === "/agent/pending") return { status: 200, body: JSON.stringify({ publications: this.pending }) };
    const report = /^\/agent\/publications\/([^/]+)\/report$/.exec(url.pathname);
    if (report && request.method === "POST") {
      const body = JSON.parse(request.body ?? "{}") as { status: string; error?: string };
      this.reports.push({ id: decodeURIComponent(report[1]!), ...body });
      this.pending = this.pending.filter((p) => p.package.id !== decodeURIComponent(report[1]!));
      return { status: 200, body: JSON.stringify({ ok: true }) };
    }
    return { status: 404, body: JSON.stringify({ error: { code: "not_found", message: "Ruta no encontrada." } }) };
  }
}

/* Un servidor FiveM falso: ficheros por recurso, estados y reinicios. */
export class FakeServer implements AgentIO {
  readonly files = new Map<string, string>();
  readonly states = new Map<string, string>([["gente_agent", "started"], ["gente_notifications", "started"]]);
  readonly restarts: string[] = [];
  readonly logs: string[] = [];
  clock = new Date("2026-10-23T12:00:00Z");
  constructor(readonly studio: FakeStudio) {}
  http(request: HttpRequest): Promise<HttpResponse> {
    return this.studio.handle(request);
  }
  readFile(resource: string, file: string): string | null {
    return this.files.get(`${resource}/${file}`) ?? null;
  }
  writeFile(resource: string, file: string, data: string): boolean {
    this.files.set(`${resource}/${file}`, data);
    return true;
  }
  resourceState(resource: string): string {
    return this.states.get(resource) ?? "missing";
  }
  restart(resource: string): void {
    this.restarts.push(resource);
  }
  log(level: "info" | "warn" | "error", message: string): void {
    this.logs.push(`${level}: ${message}`);
  }
  now(): Date {
    return this.clock;
  }
}

export function makePackage(serverId: string, overrides: Partial<PublishPackage> = {}): PublishPackage {
  return {
    v: 1,
    id: overrides.id ?? "11111111-1111-4111-8111-111111111111",
    serverId,
    product: { id: "gente-notifications", resourceName: "gente_notifications", configFile: "config.json" },
    schemaVersion: 1,
    applyMode: "now",
    config: { identity: { serverName: "RP Madrid" }, palette: { accent: "#F3B43C" } },
    issuedAt: "2026-10-23T11:59:00.000Z",
    expiresAt: "2026-10-30T11:59:00.000Z",
    ...overrides,
  };
}

export { createPublicKey };
