# Blockos Ville

Primera base responsive de Blockos Ville: página de descubrimiento, registro/inicio de sesión y perfil, con una vista 3D de avatar dentro del navegador.

## Desplegar en Render Free
- Sube el contenido de esta carpeta a la raíz de un repositorio de GitHub.
- Render: Runtime Go, Build Command `go build -o app .`, Start Command `./app`, Health Check Path `/healthz`.
- `render.yaml` puede configurar esos valores automáticamente.

## Activar cuentas persistentes con Supabase
La interfaz viene preparada para Supabase Auth y una tabla `profiles`. Sin configurar Supabase, el sitio funciona en modo de demostración local, pero las cuentas de demostración solo se guardan en ese navegador y no son seguras ni compartidas entre dispositivos.

1. Crea un proyecto en Supabase.
2. En SQL Editor ejecuta `supabase/schema.sql`.
3. En `public/config.js`, cambia `SUPABASE_URL` y `SUPABASE_ANON_KEY` por los valores de Project Settings → API.
4. En Supabase Auth, activa Email provider. Para pruebas puedes ajustar la confirmación de email, pero para uso real es mejor mantenerla activada.

Nunca pongas una `service_role` key en el navegador. Usa solamente la clave pública anon/publishable.

## Qué incluye
- Inicio adaptable para PC y móvil.
- Registro, inicio de sesión y cierre de sesión.
- Perfil con nombre de usuario y avatar 3D.
- Avatar 3D de prueba usando Three.js.
- Juegos de muestra etiquetados como demostración.
- Endpoint `/healthz`.

## Alcance honesto de esta primera versión
Todavía no incluye un motor para crear/publicar juegos, multijugador, sistema de amigos ni inventario real. Las tarjetas de juegos son ejemplos visuales. El avatar 3D es una vista inicial de demostración, no un editor completo.
