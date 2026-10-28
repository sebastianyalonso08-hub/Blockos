# Blockos Ville Classic V6

La web ahora tiene páginas separadas al estilo clásico: `/`, `/games.html`, `/catalog.html`, `/people.html`, `/profile.html`, `/avatar.html`, `/forums.html`, `/parents.html`, `/help.html` y `/game.html`.

## Render
- Build Command: `go build -o app .`
- Start Command: `./app`
- Health Check Path: `/healthz`

Sube el contenido del proyecto a la raíz del repositorio GitHub.

## Importante
La navegación ya separa las secciones en páginas distintas. Los juegos de muestra, búsqueda de jugadores, foros y equipamiento de catálogo son todavía prototipos; no están conectados a sistemas completos de juego o persistencia. Configura `public/config.js` y ejecuta `supabase/schema.sql` para preparar Supabase.

## V6 — catálogo y avatar clásicos
- Catálogo distribuido como la referencia clásica: categorías laterales, búsqueda, artículos en cuadrícula y saldo de Blockos Coins.
- Las caras usan imágenes 2D independientes; los accesorios muestran vistas previas 3D generadas con Three.js.
- Avatar R6 con vista previa de accesorios equipados, inventario por categoría y selección de color por parte del cuerpo.
- Categorías comprables: Faces, Heads, Hats, T-Shirts, Shirts y Pants.
- Para persistencia real de saldo, compras, equipamiento y colores, configura Supabase y ejecuta el archivo completo `supabase/schema.sql`.
- En modo demo, saldo, inventario y colores solo se guardan en el navegador actual.
