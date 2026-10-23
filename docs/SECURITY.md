# Seguridad del agente

Estas reglas son el contrato del agente. Cualquier cambio de código que las rompa es un bug, aunque pase los tests.

## Modelo de amenaza

El agente escribe ficheros en el servidor de un cliente a partir de lo que le dice un servicio remoto. Por tanto, el
peor caso no es que el agente falle, sino que alguien consiga usarlo para escribir lo que quiera. Las defensas se
diseñan para que ni siquiera un backend de Studio comprometido pueda hacerlo.

## Reglas

1. **Solo firma válida.** Cada paquete llega con una firma Ed25519 sobre su JSON canónico. El agente la verifica con las
   claves públicas que recibió al emparejarse (y renueva desde `/agent/keys`). Sin firma válida, no se escribe nada.
   La clave privada vive en el servidor de Studio (en un KMS en producción); el agente solo conoce las públicas.
2. **Solo datos.** El paquete solo puede apuntar a un fichero cuyo nombre acabe en `.json`. El contenido se parsea como
   JSON y se vuelve a serializar antes de escribirlo: nunca se escribe el texto recibido tal cual.
3. **Lista blanca local.** El agente lleva su propia lista de recursos permitidos (los de GENTE). Un paquete firmado que
   apunte a otro recurso se rechaza y se registra. La lista no se actualiza por red.
4. **Sin rutas raras.** El nombre del recurso y del fichero se validan con una expresión cerrada (`[A-Za-z0-9_-]`);
   cualquier `..`, barra o carácter fuera de ella se rechaza.
5. **Idempotencia.** Cada publicación tiene un id; un paquete ya aplicado no se aplica dos veces.
6. **Caducidad.** Un paquete con `expiresAt` pasado no se aplica aunque la firma sea válida.
7. **Token mínimo.** El token del agente solo sirve para pedir pendientes e informar de resultados de su propio servidor.
   Revocarlo desde Studio deja al agente fuera en la siguiente petición. Cualquier recurso del servidor puede leer
   convars y ficheros, así que el token no se guarda en convars: va en un fichero del propio recurso con permisos del
   sistema de ficheros, y se trata como revocable en cualquier momento.
8. **Sin ejecución remota.** No existe ningún mensaje que haga que el agente ejecute un comando o cargue código. Los
   únicos efectos posibles son: escribir un `config.json` permitido, reiniciar un recurso de la lista blanca, imprimir en
   consola e informar al API.
9. **Sin entrada.** El agente no abre sockets de escucha. Toda comunicación la inicia él, por HTTPS.
10. **Transparencia.** Todo lo que escribe queda en el log del servidor con el id de publicación, el recurso y el fichero.

## Qué datos salen del servidor

Versión del agente, framework detectado (esx, qbcore, qbox), nombre público del servidor (`sv_hostname`, opcional) y el
resultado de cada publicación. Nada más.
