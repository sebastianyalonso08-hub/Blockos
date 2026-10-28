# Roblox in the Browser — Render Free

This is a deployment-ready version of the supplied demo project.

## Deploy to Render
1. Upload this folder to a GitHub repository.
2. In Render, choose **New + → Blueprint** and connect that repository.
3. Render reads `render.yaml`, builds the Go server, and serves the `public/` folder.
4. Open the deployed URL. The service listens on Render's `PORT` environment variable and supports secure WebSockets (`wss://`) automatically.

## Pages
- `/` — Three.js Xbot 3D model test (uses external CDN/model URL).
- `/3d-concept.html` — same 3D concept.
- `/2.html` — supplied 3D demo with WebSocket URL adapted for Render.
- `/canvas.html` — supplied 2D WebSocket canvas demo.
- `/healthz` — service health check.
- `/echo` — WebSocket endpoint.

## Important limitations
The large HTML snippet supplied from Roblox is a legacy Roblox.com landing-page shell. It depends on Roblox-hosted bundles, APIs, authentication, and services; it is not the Roblox game engine and cannot become a working Roblox clone just by hosting that HTML on Render. This project hosts the provided demo code and does not recreate Roblox's account systems, game client, physics, or original game assets.

The Free instance may sleep after inactivity and take a little time to wake up. In-memory multiplayer state resets when the service restarts/sleeps. The model and Three.js are loaded from external URLs, so the 3D test requires internet access in the browser.
