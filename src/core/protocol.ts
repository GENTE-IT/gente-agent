/*
 * Tipos del protocolo con el API de Studio. Son una copia deliberada de `@gente/contracts`
 * (package.ts y api.ts) para que este repositorio no dependa del monorepo privado: cualquiera
 * puede leer aquí exactamente qué recibe y qué envía el agente. docs/PROTOCOL.md los explica.
 */
export const PACKAGE_VERSION = 1;
export const SIGNATURE_ALG = "ed25519";

export type ApplyMode = "now" | "next_restart";

export interface PublishPackage {
  v: number;
  id: string;
  serverId: string;
  product: { id: string; resourceName: string; configFile: string };
  schemaVersion: number;
  applyMode: ApplyMode;
  config: Record<string, unknown>;
  issuedAt: string;
  expiresAt: string;
}

export interface SignedEnvelope {
  package: PublishPackage;
  /** Base64 de la firma Ed25519 sobre canonicalize(package) en UTF-8. */
  signature: string;
  kid: string;
  alg: string;
}

export interface PublicKey {
  kid: string;
  alg: string;
  /** SubjectPublicKeyInfo en DER, base64. */
  spkiDerBase64: string;
  rawBase64: string;
}

export interface PairResponse {
  serverId: string;
  token: string;
  publicKeys: PublicKey[];
}

export interface PendingResponse {
  publications: SignedEnvelope[];
}

export type Framework = "esx" | "qbcore" | "qbox" | "unknown";

/* Comprobaciones de forma mínimas: lo que no tenga esta forma se descarta antes de mirar la firma. */
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function isSignedEnvelope(value: unknown): value is SignedEnvelope {
  if (!isRecord(value) || !isRecord(value["package"])) return false;
  const p = value["package"];
  const product = p["product"];
  return (
    isString(value["signature"]) &&
    isString(value["kid"]) &&
    isString(value["alg"]) &&
    typeof p["v"] === "number" &&
    isString(p["id"]) &&
    isString(p["serverId"]) &&
    isRecord(product) &&
    isString(product["id"]) &&
    isString(product["resourceName"]) &&
    isString(product["configFile"]) &&
    typeof p["schemaVersion"] === "number" &&
    (p["applyMode"] === "now" || p["applyMode"] === "next_restart") &&
    isRecord(p["config"]) &&
    isString(p["issuedAt"]) &&
    isString(p["expiresAt"])
  );
}

export function isPublicKey(value: unknown): value is PublicKey {
  return isRecord(value) && isString(value["kid"]) && isString(value["alg"]) && isString(value["spkiDerBase64"]) && isString(value["rawBase64"]);
}
