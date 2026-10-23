import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/core/canonical.ts";
import { checkPolicy, renderConfig } from "../src/core/policy.ts";
import { makePackage } from "./helpers.ts";

const SERVER = "dae364c5-2d0a-4371-9203-460bba94c87d";
const now = new Date("2026-10-23T12:00:00Z");

describe("política local", () => {
  it("acepta un paquete normal", () => {
    expect(checkPolicy(makePackage(SERVER), SERVER, now)).toEqual({ ok: true });
  });

  it("cierra los nombres de recurso y fichero", () => {
    const cases = [
      { resourceName: "gente_notifications", configFile: "config.lua" },
      { resourceName: "gente_notifications", configFile: "a/b.json" },
      { resourceName: "gente notifications", configFile: "config.json" },
      { resourceName: "..", configFile: "config.json" },
    ];
    for (const product of cases) {
      const result = checkPolicy(makePackage(SERVER, { product: { id: "gente-notifications", ...product } }), SERVER, now);
      expect(result.ok, JSON.stringify(product)).toBe(false);
    }
  });

  it("la lista blanca se puede ampliar solo desde código", () => {
    const pkg = makePackage(SERVER, { product: { id: "gente-garage", resourceName: "gente_garage", configFile: "config.json" } });
    expect(checkPolicy(pkg, SERVER, now).ok).toBe(false);
    expect(checkPolicy(pkg, SERVER, now, ["gente_garage"]).ok).toBe(true);
  });
});

describe("canónico y salida", () => {
  it("canonicalize coincide byte a byte con la implementación de contratos", () => {
    expect(canonicalize({ b: 1, a: { d: true, c: null }, e: [1, "x"] })).toBe('{"a":{"c":null,"d":true},"b":1,"e":[1,"x"]}');
  });

  it("lo que se escribe es una reserialización, nunca el texto recibido", () => {
    expect(renderConfig({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
