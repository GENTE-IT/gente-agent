import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Construye el recurso listo para copiar a resources/: build/gente_agent/
 *   server.js      el agente empaquetado (un único fichero, sin dependencias)
 *   fxmanifest.lua y config.json   copiados de resource/
 *   README.txt     instrucciones mínimas para quien lo descarga sin pasar por GitHub
 */
const out = join("build", "gente_agent");
rmSync("build", { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: ["src/fivem/server.ts"],
  bundle: true,
  platform: "node",
  target: "node16",
  format: "cjs",
  outfile: join(out, "server.js"),
  banner: { js: "// gente-agent · https://github.com/GENTE-IT/gente-agent · MIT · generado por scripts/build.mjs" },
  logLevel: "info",
});

// FXServer carga server.js como CommonJS; este package.json hace que Node (shim, tests) lo trate igual.
writeFileSync(join(out, "package.json"), JSON.stringify({ name: "gente_agent", private: true, type: "commonjs" }, null, 2) + "\n");
cpSync("resource/fxmanifest.lua", join(out, "fxmanifest.lua"));
cpSync("resource/config.json", join(out, "config.json"));
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
writeFileSync(
  join(out, "README.txt"),
  [
    `gente-agent ${version}`,
    "",
    "1. Copia esta carpeta (gente_agent) a resources/ y añade `ensure gente_agent` a server.cfg.",
    "2. En GENTE.ARTS Studio, Servidores, genera un código de emparejamiento.",
    "3. En la consola del servidor: gente_pair XXXX-XXXX",
    "",
    "Código y documentación: https://github.com/GENTE-IT/gente-agent",
    "",
  ].join("\n"),
);
console.log(`Recurso listo en ${out}/`);
