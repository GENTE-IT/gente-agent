import type { PublishPackage } from "./protocol.ts";

/*
 * Política local del agente (docs/SECURITY.md). Se aplica DESPUÉS de verificar la firma y es
 * independiente de ella: un paquete bien firmado que no cumpla esto se rechaza igual.
 *
 *   - Lista blanca de recursos: solo los de GENTE. No se actualiza por red.
 *   - Nombres cerrados: recurso y fichero con [A-Za-z0-9_-], y el fichero siempre .json.
 *   - Caducidad: expiresAt en el pasado = no se aplica.
 *   - Servidor: el paquete debe ir dirigido a este servidor.
 */
export const ALLOWED_RESOURCES: readonly string[] = ["gente_notifications"];

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_RE = /^[A-Za-z0-9_-]{1,64}\.json$/;

export type PolicyResult = { ok: true } | { ok: false; reason: string };

export function checkPolicy(pkg: PublishPackage, serverId: string, now: Date, allowed: readonly string[] = ALLOWED_RESOURCES): PolicyResult {
  if (pkg.v !== 1) return { ok: false, reason: `versión de paquete ${pkg.v} no soportada` };
  if (pkg.serverId !== serverId) return { ok: false, reason: "el paquete va dirigido a otro servidor" };
  if (!NAME_RE.test(pkg.product.resourceName)) return { ok: false, reason: "nombre de recurso no válido" };
  if (!FILE_RE.test(pkg.product.configFile)) return { ok: false, reason: "el fichero de destino debe ser un .json con nombre simple" };
  if (!allowed.includes(pkg.product.resourceName)) return { ok: false, reason: `el recurso ${pkg.product.resourceName} no está en la lista blanca del agente` };
  const expires = Date.parse(pkg.expiresAt);
  if (!Number.isFinite(expires)) return { ok: false, reason: "fecha de caducidad ilegible" };
  if (expires < now.getTime()) return { ok: false, reason: "el paquete ha caducado" };
  return { ok: true };
}

/** Lo que se escribe nunca es el texto recibido: se vuelve a serializar desde el objeto ya validado. */
export function renderConfig(config: Record<string, unknown>): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
