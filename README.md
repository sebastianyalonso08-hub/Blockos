# Blockos Ville Classic V3

La web ahora tiene páginas separadas al estilo clásico: `/`, `/games.html`, `/catalog.html`, `/people.html`, `/profile.html`, `/avatar.html`, `/forums.html`, `/parents.html`, `/help.html` y `/game.html`.

## Render
- Build Command: `go build -o app .`
- Start Command: `./app`
- Health Check Path: `/healthz`

Sube el contenido del proyecto a la raíz del repositorio GitHub.

## Importante
La navegación ya separa las secciones en páginas distintas. Los juegos de muestra, búsqueda de jugadores, foros y equipamiento de catálogo son todavía prototipos; no están conectados a sistemas completos de juego o persistencia. Configura `public/config.js` y ejecuta `supabase/schema.sql` para preparar Supabase.
