# Protocolo agente ↔ API de Studio

La definición formal (esquemas zod) está en `@gente/contracts` del monorepo de Studio; esto es la versión legible.
Todas las rutas van por HTTPS contra el API de Studio. El agente inicia siempre la conexión.

| Paso | Petición | Cuándo |
| --- | --- | --- |
| Emparejar | `POST /agent/pair` `{ code, agentVersion, framework?, hostname? }` → `{ serverId, token, publicKeys[] }` | Una vez, con el código que da Studio. El token solo se muestra aquí. |
| Latido | `POST /agent/heartbeat` `{ agentVersion, framework? }` (Bearer token) | Al arrancar y cada pocos minutos. |
| Pendientes | `GET /agent/pending` (Bearer token) → `{ publications: SignedEnvelope[] }` | Cada pocos segundos. |
| Resultado | `POST /agent/publications/:id/report` `{ status: "applied" \| "failed", error? }` | Tras aplicar cada paquete. |
| Claves | `GET /agent/keys` → `{ publicKeys[] }` | Si llega un paquete con un `kid` desconocido (rotación). |

## Sobre firmado (`SignedEnvelope`)

```json
{
  "package": {
    "v": 1,
    "id": "uuid de la publicación",
    "serverId": "uuid del servidor (debe coincidir con el propio)",
    "product": { "id": "gente-notifications", "resourceName": "gente_notifications", "configFile": "config.json" },
    "schemaVersion": 1,
    "applyMode": "now" | "next_restart",
    "config": { "...": "la configuración validada" },
    "issuedAt": "ISO 8601",
    "expiresAt": "ISO 8601"
  },
  "signature": "base64 de la firma Ed25519 sobre canonicalize(package) en UTF-8",
  "kid": "id de la clave",
  "alg": "ed25519"
}
```

`canonicalize` = JSON con claves ordenadas y sin espacios (subconjunto de RFC 8785). La implementación de referencia está
en `packages/contracts/src/canonical.ts` del monorepo de Studio; el agente debe reproducirla byte a byte.

## Claves públicas

```json
{ "kid": "prod-2026-10", "alg": "ed25519", "spkiDerBase64": "...", "rawBase64": "..." }
```

`spkiDerBase64` es lo que entiende `crypto.verify(null, data, { key, format: "der", type: "spki" }, signature)` en Node.
