import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { installFiveMShim } from "./fivem-shim.mjs";

/*
 * Prueba de extremo a extremo contra un API de Studio en desarrollo (NODE_ENV != production):
 *   1. abre una sesión de desarrollo, se concede la licencia y crea un servidor con su código;
 *   2. arranca el recurso construido dentro del shim de FXServer y lo empareja con ese código;
 *   3. publica una configuración desde el API y espera a que el agente la escriba, reinicie el recurso
 *      e informe; comprueba que Studio ve la publicación como aplicada.
 *
 * Uso: npm run build && node scripts/simulate.mjs <ruta a config.json válido> [apiOrigin]
 */
const [, , configPath, apiOrigin = "http://localhost:8787"] = process.argv;
if (!configPath) {
  console.error("Uso: node scripts/simulate.mjs <config.json> [apiOrigin]");
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));
// La base de datos (jsonb) no conserva el orden de las claves: se compara el contenido, no el texto.
const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);

const api = async (path, init = {}, cookie) => {
  const res = await fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: { "content-type": "application/json", origin: "http://localhost:5173", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(body)}`);
  return { res, body };
};

// 1. Cuenta de desarrollo, licencia y servidor.
const login = await api("/auth/dev-login", { method: "POST", body: JSON.stringify({ username: "Simulación" }) });
const cookie = login.res.headers.get("set-cookie")?.split(";")[0];
await api("/auth/dev-grant", { method: "POST", body: JSON.stringify({ productId: "gente-notifications" }) }, cookie);
const server = (await api("/servers", { method: "POST", body: JSON.stringify({ name: "Simulación FXServer" }) }, cookie)).body;
const pairing = (await api(`/servers/${server.id}/pairing-code`, { method: "POST" }, cookie)).body;
console.log(`servidor ${server.id} · código ${pairing.code}`);

// 2. Recurso construido dentro del shim.
const resourcesDir = resolve("build/sim-resources");
rmSync(resourcesDir, { recursive: true, force: true });
mkdirSync(join(resourcesDir, "gente_agent"), { recursive: true });
mkdirSync(join(resourcesDir, "gente_notifications"), { recursive: true });
writeFileSync(join(resourcesDir, "gente_agent", "config.json"), JSON.stringify({ apiOrigin, pollSeconds: 3, heartbeatMinutes: 5 }));
const shim = installFiveMShim({ resourcesDir, convars: { gente_api: apiOrigin, sv_hostname: "Simulación" } });
const require = createRequire(import.meta.url);
require(resolve("build/gente_agent/server.js"));
shim.emit("onResourceStart", "gente_agent");
shim.run("gente_pair", pairing.code);
await new Promise((r) => setTimeout(r, 1500));

// 3. Publicar y esperar a que el agente la aplique.
const publication = (await api(`/servers/${server.id}/publications`, { method: "POST", body: JSON.stringify({ productId: "gente-notifications", config, applyMode: "now" }) }, cookie)).body;
console.log(`publicación ${publication.id} en cola`);
let status = publication.status;
for (let i = 0; i < 10 && status !== "applied" && status !== "failed"; i += 1) {
  await new Promise((r) => setTimeout(r, 1500));
  const rows = (await api(`/servers/${server.id}/publications`, {}, cookie)).body.publications;
  status = rows.find((p) => p.id === publication.id)?.status ?? status;
}
const written = JSON.parse(readFileSync(join(resourcesDir, "gente_notifications", "config.json"), "utf8"));
const same = canonical(written) === canonical(config);
const ok = status === "applied" && same && shim.executed.includes("restart gente_notifications");
console.log(`estado final: ${status} · config.json escrito: ${same} · reinicio ejecutado: ${shim.executed.includes("restart gente_notifications")}`);
console.log(ok ? "SIMULACIÓN OK" : "SIMULACIÓN FALLIDA");
process.exit(ok ? 0 : 1);
