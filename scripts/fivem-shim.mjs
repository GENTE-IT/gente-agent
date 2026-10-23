import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/*
 * Simulación mínima del runtime de servidor de FXServer para probar el recurso construido
 * (build/gente_agent/server.js) en Node sin un servidor FiveM. Define las natives que usa el agente
 * sobre una carpeta `resources/` normal. NO es FXServer: sirve para el desarrollo y para la prueba
 * de extremo a extremo contra el API; la prueba real es un FXServer de verdad.
 */
export function installFiveMShim({ resourcesDir, convars = {}, log = console.log }) {
  const commands = new Map();
  const listeners = new Map();
  const executed = [];
  const resourcePath = (name) => join(resourcesDir, name);

  globalThis.GetCurrentResourceName = () => "gente_agent";
  globalThis.GetResourceState = (name) => (existsSync(resourcePath(name)) ? "started" : "missing");
  globalThis.LoadResourceFile = (name, file) => {
    const p = join(resourcePath(name), file);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };
  globalThis.SaveResourceFile = (name, file, data) => {
    const p = join(resourcePath(name), file);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
    return true;
  };
  globalThis.ExecuteCommand = (cmd) => {
    executed.push(cmd);
    log(`[shim] ExecuteCommand: ${cmd}`);
  };
  globalThis.RegisterCommand = (name, handler) => commands.set(name, handler);
  globalThis.GetConvar = (name, fallback) => convars[name] ?? fallback;
  globalThis.PerformHttpRequest = (url, callback, method, data, headers) => {
    fetch(url, { method, headers, body: method === "GET" ? undefined : data }).then(
      async (res) => callback(res.status, await res.text(), Object.fromEntries(res.headers.entries())),
      () => callback(0, null, {}),
    );
  };
  globalThis.on = (event, handler) => listeners.set(event, handler);

  return {
    commands,
    executed,
    /** Ejecuta un comando de consola registrado por el recurso (source 0 = consola). */
    run: (name, ...args) => commands.get(name)?.(0, args, `${name} ${args.join(" ")}`),
    emit: (event, ...args) => listeners.get(event)?.(...args),
  };
}
