# Blockos Ville

Classic Roblox-inspired website with a Go HTTP backend and plain HTML/CSS/JavaScript frontend.

## Run locally

```sh
go build -o app .
./app
```

Open `http://localhost:10000`. The server stores its data in `data/blockos-accounts-v2.json` by default. Set `BLOCKOS_DATA_DIR` to choose the data directory.

## Account IDs and authentication

- The new v2 database is separate from the previous `blockos.json`; old accounts and records are not imported.
- The first account receives `0001`, the next `0002`, then `0003`, and so on.
- IDs are strings so leading zeroes are preserved. Allocation is serialized on the server and the next ID is persisted, so simultaneous registrations cannot receive the same ID and IDs are not reused.
- Four-digit IDs support up to 9,999 accounts. Registration returns a clear error after that range is exhausted.
- The account ID is the shared identity used by profiles and user-owned records.
- Passwords are salted and hashed on the server. Sessions use random server-issued tokens in HttpOnly cookies; the public account ID is never an authentication credential.
- The login/sign-up dialog is required when no valid session exists, including on a first visit. A valid session is restored after page navigation and refresh.

Password recovery and email verification are not implemented.

## Render persistence

The JSON database survives normal requests, but Render's free web-service filesystem is ephemeral and may be erased when the service restarts or redeploys. A persistent disk or external database is required for guaranteed long-term production persistence. This project does not use Supabase.

## Existing feature limits

This update focuses on account identity, authentication/session handling, and connecting user records to the numeric account ID. It does not turn unfinished game play, cross-device real-time multiplayer, moderation/reporting, or the full publishing pipeline into completed features.

## V26 functional fixes

- The sign-up/log-in dialog is displayed immediately on first visit, before session or 3D initialization. The site navigation/content is kept hidden until a valid account session is restored or a new account is created; no guest session is created.
- WebGL initialization failures are contained so they cannot stop authentication and the rest of the page scripts from starting.
- The built-in catalog is initialized in the Go database (not only in browser memory), and purchases reject unknown item IDs. Purchased items are written to inventory and can be equipped into the avatar.
- Profile description updates are persisted in the account profile record.
- People search and friend-request storage/acceptance use the same numeric account IDs. Friend requests are visible to both participants and enriched with sender/receiver profile details.
- The frontend loads catalog, avatar, profile, people, and friends independently so a failed section does not leave the other sections stuck in a loading state.

The classic HTML structure and CSS styling are retained. Automated checks: `go test ./...`, `go test -race ./...`, and `node --check public/app.js`.
