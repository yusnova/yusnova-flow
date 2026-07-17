# Booking backend (demo)

API route handlers for the local booking demo domain.

| Path | Role |
| --- | --- |
| `app/api/**/route.ts` | Next.js App Router handlers (source of truth) |
| `lib/` | Shared fixtures/types mirrored for static scanning |

Runtime: start the Next.js UI from `../frontend` (`npm run dev`). That app
embeds a copy of these handlers under `frontend/app/api` so Next can serve
`/api/*` on **http://localhost:3000**. Keep the two trees in sync when you
edit a route (backend = contract source for STLC scanning; frontend = runtime).

```bash
cd ../frontend && npm install && npm run dev
```

Target: **http://localhost:3000** (UI) and **http://localhost:3000/api/***.
