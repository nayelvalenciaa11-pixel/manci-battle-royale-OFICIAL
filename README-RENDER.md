# Manci Battle Royale — despliegue en Render

## Publicar en GitHub
1. Crea un repositorio nuevo en GitHub.
2. Descomprime este ZIP en tu computadora.
3. Sube al repositorio todos los archivos y carpetas, conservando la estructura:
   - `server.js`
   - `package.json` y `package-lock.json`
   - `render.yaml`
   - `public/`
   - `ui-settings.json`

## Publicar en Render
1. Entra en https://render.com y elige **New + → Web Service**.
2. Conecta tu cuenta de GitHub y selecciona el repositorio.
3. Render detectará `render.yaml`. Si te pide los campos manualmente:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Pulsa **Deploy Web Service** y espera a que termine.
5. Abre la URL `https://...onrender.com` que te entregue Render.

## Importante
Este juego usa WebSocket para el multijugador. Debe desplegarse como **Web Service**, no como sitio estático de GitHub Pages. El cliente detecta automáticamente HTTPS y conecta mediante WSS.
En el plan gratuito, el servicio puede tardar en arrancar después de un periodo sin uso. El archivo `ui-settings.json` puede no conservar cambios entre reinicios en un servicio con disco efímero.
