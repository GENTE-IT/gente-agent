import { Agent, type AgentIO, type HttpRequest, type HttpResponse } from "../core/agent.ts";
import type { Framework } from "../core/protocol.ts";

/*
 * Capa de FiveM: traduce las natives de FXServer a la interfaz del agente y monta el bucle.
 *
 *   config.json        apiOrigin, pollSeconds, heartbeatMinutes (dentro del recurso)
 *   convar gente_api   sobrescribe apiOrigin (p. ej. en desarrollo: set gente_api "http://localhost:8787")
 *   comando gente_pair <código>   emparejar (restringido: consola o ace command.gente_pair)
 *   comando gente_status          estado del agente
 */
const AGENT_VERSION = "0.1.0";
const SELF = GetCurrentResourceName();

interface AgentConfig {
  apiOrigin: string;
  pollSeconds: number;
  heartbeatMinutes: number;
}

function readConfig(): AgentConfig {
  const defaults: AgentConfig = { apiOrigin: "https://api.gente.ws", pollSeconds: 5, heartbeatMinutes: 5 };
  try {
    const raw = LoadResourceFile(SELF, "config.json");
    const parsed = raw ? (JSON.parse(raw) as Partial<AgentConfig>) : {};
    const convar = GetConvar("gente_api", "");
    return {
      apiOrigin: convar || (typeof parsed.apiOrigin === "string" ? parsed.apiOrigin : defaults.apiOrigin),
      pollSeconds: clamp(parsed.pollSeconds, 3, 120, defaults.pollSeconds),
      heartbeatMinutes: clamp(parsed.heartbeatMinutes, 1, 60, defaults.heartbeatMinutes),
    };
  } catch {
    return defaults;
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function detectFramework(): Framework {
  if (GetResourceState("es_extended") === "started") return "esx";
  if (GetResourceState("qbx_core") === "started") return "qbox";
  if (GetResourceState("qb-core") === "started") return "qbcore";
  return "unknown";
}

const io: AgentIO = {
  http: (request: HttpRequest) =>
    new Promise<HttpResponse>((resolve) => {
      PerformHttpRequest(
        request.url,
        (statusCode, body) => resolve({ status: statusCode, body: body ?? "" }),
        request.method,
        request.body ?? "",
        request.headers,
      );
    }),
  readFile: (resource, file) => LoadResourceFile(resource, file),
  writeFile: (resource, file, data) => SaveResourceFile(resource, file, data, -1),
  resourceState: (resource) => GetResourceState(resource),
  restart: (resource) => ExecuteCommand(`restart ${resource}`),
  log: (level, message) => console.log(`^3[gente-agent]^7 ${level === "error" ? "^1" : level === "warn" ? "^3" : ""}${message}^7`),
  now: () => new Date(),
};

const config = readConfig();
const agent = new Agent(io, {
  apiOrigin: config.apiOrigin,
  agentVersion: AGENT_VERSION,
  selfResource: SELF,
  detectFramework,
  hostname: () => GetConvar("sv_hostname", "") || undefined,
});

if (!/^https:/.test(config.apiOrigin) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(config.apiOrigin)) {
  io.log("warn", `El API no va por HTTPS (${config.apiOrigin}). Solo aceptable en desarrollo.`);
}

RegisterCommand(
  "gente_pair",
  (source, args) => {
    if (source !== 0) {
      io.log("warn", "gente_pair solo se ejecuta desde la consola del servidor.");
      return;
    }
    const code = (args[0] ?? "").trim();
    if (!code) {
      io.log("warn", "Uso: gente_pair XXXX-XXXX (el código lo da Studio en Servidores).");
      return;
    }
    void agent.pair(code).then((result) => {
      if (result.ok) io.log("info", "Listo: las publicaciones de Studio llegarán solas a este servidor.");
      else io.log("error", `No se pudo emparejar: ${result.message}`);
    });
  },
  true,
);

RegisterCommand(
  "gente_status",
  () => {
    io.log("info", agent.paired ? `Emparejado (servidor ${agent.serverId}). API: ${config.apiOrigin}. Sondeo cada ${config.pollSeconds} s.` : `Sin emparejar. API: ${config.apiOrigin}. Ejecuta gente_pair con el código de Studio.`);
  },
  true,
);

let busy = false;
async function tick(): Promise<void> {
  if (busy || !agent.paired) return;
  busy = true;
  try {
    await agent.pollOnce();
  } catch (error) {
    io.log("warn", `Error al sondear Studio: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    busy = false;
  }
}

setInterval(() => void tick(), config.pollSeconds * 1000);
setInterval(() => void agent.heartbeat().catch(() => undefined), config.heartbeatMinutes * 60 * 1000);

on("onResourceStart", (resourceName: unknown) => {
  if (resourceName !== SELF) return;
  io.log("info", `gente-agent ${AGENT_VERSION} · API ${config.apiOrigin} · ${agent.paired ? "emparejado" : "sin emparejar (gente_pair <código>)"}`);
  void agent.heartbeat().catch(() => undefined);
  void tick();
});
