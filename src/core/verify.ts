import { createPublicKey, verify } from "node:crypto";
import { canonicalize } from "./canonical.ts";
import { SIGNATURE_ALG, type PublicKey, type SignedEnvelope } from "./protocol.ts";

/*
 * Verificación de la firma de un sobre con las claves públicas del API. Solo Ed25519, solo la
 * librería estándar de Node (FXServer la trae): sin dependencias que auditar.
 */
export function verifyEnvelope(envelope: SignedEnvelope, keys: readonly PublicKey[]): boolean {
  if (envelope.alg !== SIGNATURE_ALG) return false;
  const key = keys.find((k) => k.kid === envelope.kid && k.alg === SIGNATURE_ALG);
  if (!key) return false;
  try {
    const publicKey = createPublicKey({ key: Buffer.from(key.spkiDerBase64, "base64"), format: "der", type: "spki" });
    if (publicKey.asymmetricKeyType !== "ed25519") return false;
    return verify(null, Buffer.from(canonicalize(envelope.package), "utf8"), publicKey, Buffer.from(envelope.signature, "base64"));
  } catch {
    return false;
  }
}
