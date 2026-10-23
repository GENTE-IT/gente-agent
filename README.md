# gente-agent

Recurso de FiveM, de código abierto, que recibe las configuraciones publicadas desde **GENTE.ARTS Studio** y las
aplica en el servidor. Lo instala el owner del servidor como cualquier otro recurso; funciona igual en un VPS propio,
en un hosting con panel o en txAdmin.

Este repositorio existe para que cualquiera pueda leer qué hace el agente antes de instalarlo. Las reglas que
cumple el código están en [`docs/SECURITY.md`](docs/SECURITY.md) y el protocolo con Studio en
[`docs/PROTOCOL.md`](docs/PROTOCOL.md).

## Qué hace

1. **Se empareja** con una cuenta de Studio mediante un código de un solo uso que el owner pega en la consola del
   servidor (`gente_pair XXXX-XXXX`). A cambio recibe un token propio de ese servidor y las claves públicas de firma.
2. **Pregunta** al API de Studio, cada pocos segundos, si hay publicaciones pendientes para ese servidor. El API nunca
   entra en el servidor: es el agente el que pide.
3. **Verifica la firma** Ed25519 de cada paquete con las claves públicas. Un paquete sin firma válida se descarta y se
   registra.
4. **Escribe solo ficheros de datos** (`config.json`) dentro de los recursos de GENTE que están en su lista blanca.
   Nunca escribe Lua ni JavaScript, nunca fuera de esa lista, nunca ejecuta nada que venga del paquete.
5. **Aplica** el cambio: reinicia el recurso si el owner eligió «ahora», o avisa en consola si eligió «en el próximo
   reinicio».
6. **Informa** al API del resultado (aplicado o fallido, con el motivo) para que el owner lo vea en Studio y pueda volver
   atrás.

Si el API de Studio no responde, el servidor sigue funcionando con el último `config.json` escrito: los scripts de
GENTE no dependen del agente ni de Studio en tiempo de ejecución.

## Qué NO hace

- No abre puertos ni acepta conexiones entrantes.
- No lee ni envía nada del servidor salvo su versión, el framework detectado, el nombre público (`sv_hostname`) y el
  resultado de cada publicación.
- No puede recibir código: el formato del paquete solo admite un fichero JSON y el agente lo valida antes de escribirlo.
- No toca recursos que no estén en su lista blanca, aunque un paquete firmado lo pida.

## Instalación

1. Descarga la última release y descomprime la carpeta `gente_agent` en `resources/`.
2. Añade `ensure gente_agent` a tu `server.cfg` y arranca el servidor.
3. En Studio, entra en **Servidores**, crea tu servidor y pulsa **Código de emparejamiento**.
4. Pega en la consola del servidor (txAdmin o terminal) el comando que te da Studio:

   ```
   gente_pair XXXX-XXXX
   ```

   El código caduca a los diez minutos y solo sirve una vez. `gente_status` muestra si el agente está emparejado.

A partir de ahí las publicaciones llegan solas. Si en Studio revocas el servidor, el agente queda fuera en la
siguiente petición y hay que volver a emparejar.

### Configuración

`config.json` dentro del recurso:

| Clave | Por defecto | Qué es |
| --- | --- | --- |
| `apiOrigin` | `https://api.gente.ws` | API de Studio. El convar `gente_api` lo sobrescribe (útil en desarrollo). |
| `pollSeconds` | `5` | Cada cuánto pregunta por publicaciones pendientes (3 a 120). |
| `heartbeatMinutes` | `5` | Cada cuánto manda su versión y framework (1 a 60). |

El estado del emparejamiento (token y claves públicas) se guarda en `state.json` dentro del propio recurso. Borrar
ese fichero equivale a desemparejar.

## Para desarrolladores

Sin dependencias en tiempo de ejecución: el agente es un único `server.js` que usa la librería estándar de Node que
FXServer incorpora (`crypto` para Ed25519) y las natives de FiveM (`LoadResourceFile`, `SaveResourceFile`,
`PerformHttpRequest`, `ExecuteCommand`, `RegisterCommand`).

```
src/core/      el agente sin nada de FiveM: protocolo, JSON canónico, verificación, política y bucle
src/fivem/     la capa que traduce natives y monta comandos e intervalos
resource/      fxmanifest.lua y config.json
scripts/       build (esbuild → build/gente_agent/), shim de FXServer y simulación de extremo a extremo
test/          vitest: firmas reales, API falso, servidor falso
```

```bash
npm install
npm run check                 # typecheck + tests + build
node scripts/simulate.mjs <config.json> [http://localhost:8787]
```

La simulación levanta el recurso construido dentro de un shim de FXServer en Node, lo empareja contra un API de
Studio en desarrollo, publica una configuración y comprueba que el agente la escribe, reinicia el recurso e informa.
No sustituye a una prueba en un FXServer real, pero cubre todo el camino salvo las natives.

Los tipos del protocolo (`src/core/protocol.ts`) y el JSON canónico (`src/core/canonical.ts`) son copias deliberadas de
`@gente/contracts` del monorepo de Studio: si cambian allí, cambian aquí.

Licencia MIT: puedes leerlo, auditarlo, modificarlo y redistribuirlo. Si encuentras un problema de seguridad, escribe a
mateo.dev@gente.ws antes de publicarlo.
