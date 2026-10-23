import { beforeEach, describe, expect, it } from "vitest";
import { Agent } from "../src/core/agent.ts";
import { FakeServer, FakeStudio, makePackage } from "./helpers.ts";

const SERVER_ID = "dae364c5-2d0a-4371-9203-460bba94c87d";

let studio: FakeStudio;
let server: FakeServer;
let agent: Agent;

beforeEach(async () => {
  studio = new FakeStudio();
  studio.pairCodes.set("ABCD-EFGH", SERVER_ID);
  server = new FakeServer(studio);
  agent = new Agent(server, { apiOrigin: "https://api.test/", agentVersion: "0.1.0-test", selfResource: "gente_agent" });
  expect(agent.paired).toBe(false);
  const result = await agent.pair("ABCD-EFGH");
  expect(result).toEqual({ ok: true, serverId: SERVER_ID });
});

describe("emparejamiento y estado", () => {
  it("guarda el token y las claves en el propio recurso y los recupera al arrancar", () => {
    const state = JSON.parse(server.readFile("gente_agent", "state.json")!);
    expect(state.serverId).toBe(SERVER_ID);
    expect(state.token).toBe("token-1");
    expect(state.publicKeys).toHaveLength(1);
    const again = new Agent(server, { apiOrigin: "https://api.test", agentVersion: "0.1.0-test", selfResource: "gente_agent" });
    expect(again.paired).toBe(true);
    expect(again.serverId).toBe(SERVER_ID);
  });

  it("un código incorrecto no empareja", async () => {
    const fresh = new Agent(new FakeServer(studio), { apiOrigin: "https://api.test", agentVersion: "0.1.0-test", selfResource: "gente_agent" });
    const result = await fresh.pair("XXXX-XXXX");
    expect(result.ok).toBe(false);
    expect(fresh.paired).toBe(false);
  });

  it("si Studio revoca el servidor, el agente se desempareja", async () => {
    studio.revoked = true;
    await agent.pollOnce();
    expect(agent.paired).toBe(false);
    expect(server.readFile("gente_agent", "state.json")).toBe("{}\n");
  });
});

describe("aplicar publicaciones", () => {
  it("escribe el config.json, reinicia el recurso e informa de aplicada", async () => {
    const pkg = makePackage(SERVER_ID);
    studio.pending = [studio.sign(pkg)];
    expect(await agent.pollOnce()).toBe(1);
    expect(server.files.get("gente_notifications/config.json")).toBe(`${JSON.stringify(pkg.config, null, 2)}\n`);
    expect(server.restarts).toEqual(["gente_notifications"]);
    expect(studio.reports).toEqual([{ id: pkg.id, status: "applied" }]);
  });

  it("en modo «próximo reinicio» escribe pero no reinicia", async () => {
    studio.pending = [studio.sign(makePackage(SERVER_ID, { applyMode: "next_restart" }))];
    await agent.pollOnce();
    expect(server.files.has("gente_notifications/config.json")).toBe(true);
    expect(server.restarts).toEqual([]);
    expect(studio.reports[0]?.status).toBe("applied");
  });

  it("no aplica dos veces el mismo paquete, pero vuelve a informar", async () => {
    studio.pending = [studio.sign(makePackage(SERVER_ID))];
    await agent.pollOnce();
    studio.pending = [studio.sign(makePackage(SERVER_ID))];
    await agent.pollOnce();
    expect(server.restarts).toHaveLength(1);
    expect(studio.reports).toHaveLength(2);
  });

  it("rechaza una firma de otra clave aunque el kid coincida", async () => {
    const pkg = makePackage(SERVER_ID);
    studio.pending = [studio.signWithImpostor(pkg)];
    await agent.pollOnce();
    expect(server.files.has("gente_notifications/config.json")).toBe(false);
    expect(studio.reports).toEqual([{ id: pkg.id, status: "failed", error: "firma no válida" }]);
  });

  it("rechaza un paquete manipulado tras la firma", async () => {
    const env = studio.sign(makePackage(SERVER_ID));
    env.package.product.configFile = "server.lua.json";
    studio.pending = [env];
    await agent.pollOnce();
    expect(studio.reports[0]?.status).toBe("failed");
    expect(server.files.size).toBe(1); // solo state.json
  });

  it("rechaza recursos fuera de la lista blanca y ficheros que no sean .json, aunque la firma sea válida", async () => {
    const a = makePackage(SERVER_ID, { id: "22222222-2222-4222-8222-222222222222", product: { id: "x", resourceName: "qb-core", configFile: "config.json" } });
    const b = makePackage(SERVER_ID, { id: "33333333-3333-4333-8333-333333333333", product: { id: "gente-notifications", resourceName: "gente_notifications", configFile: "../server.cfg" } });
    studio.pending = [studio.sign(a), studio.sign(b)];
    await agent.pollOnce();
    expect(server.files.size).toBe(1);
    expect(studio.reports.map((r) => r.status)).toEqual(["failed", "failed"]);
    expect(studio.reports[0]?.error).toContain("lista blanca");
  });

  it("rechaza paquetes caducados y los dirigidos a otro servidor", async () => {
    const expired = makePackage(SERVER_ID, { id: "44444444-4444-4444-8444-444444444444", expiresAt: "2026-10-01T00:00:00.000Z" });
    const other = makePackage("00000000-0000-4000-8000-000000000000", { id: "55555555-5555-4555-8555-555555555555" });
    studio.pending = [studio.sign(expired), studio.sign(other)];
    await agent.pollOnce();
    expect(server.files.size).toBe(1);
    expect(studio.reports.map((r) => r.error)).toEqual(["el paquete ha caducado", "el paquete va dirigido a otro servidor"]);
  });

  it("si el recurso no está instalado, informa del fallo sin escribir nada", async () => {
    server.states.delete("gente_notifications");
    studio.pending = [studio.sign(makePackage(SERVER_ID))];
    await agent.pollOnce();
    expect(studio.reports[0]).toMatchObject({ status: "failed" });
    expect(studio.reports[0]?.error).toContain("no está instalado");
  });

  it("si el recurso está parado, escribe sin reiniciar", async () => {
    server.states.set("gente_notifications", "stopped");
    studio.pending = [studio.sign(makePackage(SERVER_ID))];
    await agent.pollOnce();
    expect(server.files.has("gente_notifications/config.json")).toBe(true);
    expect(server.restarts).toEqual([]);
    expect(studio.reports[0]?.status).toBe("applied");
  });

  it("con una clave rotada, refresca las públicas antes de rechazar", async () => {
    studio.rotate("prod-2");
    studio.pending = [studio.sign(makePackage(SERVER_ID), "prod-2")];
    await agent.pollOnce();
    expect(studio.reports[0]?.status).toBe("applied");
    const state = JSON.parse(server.readFile("gente_agent", "state.json")!);
    expect(state.publicKeys.map((k: { kid: string }) => k.kid)).toContain("prod-2");
  });

  it("descarta respuestas con forma inesperada sin romperse", async () => {
    studio.pending = [{ package: { id: "nope" } } as never];
    expect(await agent.pollOnce()).toBe(0);
    expect(server.logs.some((l) => l.includes("forma inesperada"))).toBe(true);
  });
});
