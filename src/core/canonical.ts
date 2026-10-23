/*
 * JSON canónico: la misma secuencia de bytes que firma el API (packages/contracts/src/canonical.ts del
 * monorepo de Studio). Reglas: claves ordenadas por su valor de código, sin espacios, números y cadenas
 * como JSON.stringify, `undefined` omitido en objetos y prohibido en arrays, sin NaN ni infinitos.
 * Si esto cambia aquí o allí, ninguna firma volverá a verificar: cambiar las dos copias a la vez.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalize: número no finito.");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value
          .map((item) => {
            if (item === undefined) throw new TypeError("canonicalize: undefined dentro de un array.");
            return canonicalize(item);
          })
          .join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((k) => record[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`).join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalize: tipo no serializable (${typeof value}).`);
  }
}
