# gente-agent

Recurso de FiveM, de código abierto, que recibe las configuraciones publicadas desde **GENTE.ARTS Studio** y las
aplica en el servidor. Lo instala el owner del servidor como cualquier otro recurso; funciona igual en un VPS propio,
en un hosting con panel o en txAdmin.

> Estado: **en construcción**. Este repositorio existe desde el principio para que cualquiera pueda leer qué hace el
> agente antes de instalarlo. El código llegará aquí con sus pruebas; mientras tanto, este README y
> [`docs/SECURITY.md`](docs/SECURITY.md) son el contrato que el código tendrá que cumplir.

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
- No lee ni envía nada del servidor salvo su versión, el framework detectado y el resultado de cada publicación.
- No puede recibir código: el formato del paquete solo admite un fichero JSON y el agente lo valida antes de escribirlo.
- No toca recursos que no estén en su lista blanca, aunque un paquete firmado lo pida.

## Instalación (cuando exista la primera versión)

1. Descarga la release, descomprime `gente_agent` en `resources/` y añade `ensure gente_agent` a tu `server.cfg`.
2. En Studio, crea tu servidor y genera un código de emparejamiento.
3. Pega en la consola del servidor el comando que te da Studio. Listo: las publicaciones llegan solas.

## Para desarrolladores

El agente se escribe en JavaScript de servidor (FXServer trae Node.js, con lo que la verificación Ed25519 usa la
librería estándar `crypto`, sin dependencias). El protocolo con el API y el formato del paquete firmado están definidos
en el paquete `@gente/contracts` del monorepo de Studio y se documentan aquí en [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

Licencia MIT: puedes leerlo, auditarlo, modificarlo y redistribuirlo. Si encuentras un problema de seguridad, escribe a
mateo.dev@gente.ws antes de publicarlo.
