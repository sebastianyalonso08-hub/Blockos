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
- La versión actual no admite cuentas demo ni sesiones Guest. Las cuentas, perfiles, amigos, compras, inventario y colores requieren Supabase configurado.


## Accounts and friends (V11)
- The signup form uses a username and password only. For Supabase Auth, this version maps usernames to an internal synthetic email address (`username@accounts.blockosville.invalid`); turn off Confirm email in Supabase Auth settings for this approach to work without an actual email inbox. Existing email-based accounts will need a migration or a separate username mapping before username-only login can authenticate them.
- Run the updated `supabase/schema.sql` to add `friend_requests`. People lists registered profiles, lets signed-in players send requests, and Your Friends separates accepted friends, incoming requests (Accept/Reject), and sent requests.
- V16 removes local/demo accounts. Supabase must be configured for account creation, login, profiles, People, friend requests, inventory and avatar persistence. When signed out, the account dialog remains open until a user signs in.


Profile update: profile links use the immutable Supabase account UUID when available; profiles display Account ID and Description. The owner can edit Description, visitors can only read it. Run the latest supabase/schema.sql to add profiles.description. The extra header My Profile button and Multiplayer navigation links have been removed; My Profile remains in the main navigation beside Avatar. The login form always displays the Username field.

## V16 — Account-only sessions
- Removed local demo account creation and sign-in.
- Signing out clears the active avatar state and opens the Create Account / Log In dialog.
- People and profile pages require a real Supabase-authenticated account; profile URLs use Supabase UUIDs.
- Legacy local demo-account keys are cleared so old local identities are not restored.

- La versión sin demo no incluye cuentas locales, juegos de ejemplo ni artículos de catálogo precargados. Los juegos y artículos solo aparecen cuando se publican en la base de datos.
