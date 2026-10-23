fx_version 'cerulean'
game 'gta5'

name 'gente_agent'
author 'GENTE.ARTS'
description 'Aplica en este servidor las configuraciones publicadas desde GENTE.ARTS Studio. Código abierto: https://github.com/GENTE-IT/gente-agent'
version '0.1.0'

-- El agente solo corre en el servidor. No tiene parte de cliente ni NUI.
server_script 'server.js'

-- Ficheros de datos del propio recurso: configuración del agente y estado del emparejamiento.
files {
  'config.json',
}
