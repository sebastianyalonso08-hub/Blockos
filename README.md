# Blockos Ville

Classic Roblox-inspired website with a Go HTTP backend and plain HTML/CSS/JavaScript frontend.

## Run locally

```sh
go build -o app .
./app
```

Open `http://localhost:10000`. The server creates `data/blockos.json` for accounts and backend records. Set `BLOCKOS_DATA_DIR` to choose the data directory.

## Render

Build command: `go build -o app .`
Start command: `./app`
Health check: `/healthz`

**Persistence note:** Render's free web service filesystem is ephemeral. The JSON database survives normal requests but can be erased when Render restarts or redeploys the service. To guarantee long-term account persistence, use a persistent disk (where available) or connect a database. This build does not use Supabase.

## Accounts

The Go server handles account creation, username/password login, and logout. Passwords are salted and hashed on the server; session IDs are stored in HttpOnly cookies. Use a unique password for this prototype and do not reuse a password from another service. Password recovery and email verification are not implemented.

Some areas remain prototypes: game play, cross-device real-time multiplayer, moderation/reporting, and a complete publishing pipeline. Do not assume these features are live just because a page exists.
