<div align="center">

# Booking flow

</div>

## Contents

| Section | What you’ll find |
| --- | --- |
| [Run the app](#run-the-app) | Node or Docker → **http://localhost:3000** |
| [Playwright (E2E)](#playwright-e2e) | Browsers, `npm test`, HTML report |
| [Repository layout](#repository-layout) | `frontend/`, `backend/`, `automation/` |
| [Fixture postcodes](#fixture-postcodes) | Demo postcodes & waste rules |
| [API (contract)](#api-contract) | REST routes |
| [Mocking & data](#mocking--data) | Where data is built |
| [Submission artifacts](#submission-artifacts) | Lighthouse report, axe CLI output |

## Run the app

> [!TIP]
> **Target URL** — [http://localhost:3000](http://localhost:3000) for both options below.

### Local (Node.js)

Fastest loop while you change code.

| Step | Command |
| ---: | --- |
| 1 | `cd frontend` (repo root sibling of `automation/`) |
| 2 | `npm install` |
| 3 | `npm run dev` |

Open **http://localhost:3000** in the browser.

### Docker

Containerised app; you only need Docker on the machine, not a local Node install for *running* the UI (images still build with Node inside Docker).

> [!WARNING]
> **Shell location** — Run `docker compose` from **`frontend/`**. API handlers live in `../backend/app/api` and are linked into this app.

| Step | Action |
| ---: | --- |
| 1 | Install and start **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (or Docker Engine on Linux). |
| 2 | `docker compose up --build` |
| 3 | Open **http://localhost:3000** when the service is ready. |


## Playwright (E2E)

> [!NOTE]
> **Automated checks** — Specs live under [`automation/playwright/tests/`](automation/playwright/tests/) (`*.ui.spec.ts`). The UI uses stable **`data-testid`** attributes for selectors.

### Run tests

```bash
cd automation
npm install
npx playwright install
npm test
```

> [!TIP]
> **Two terminals** — Keep **`npm run dev`** in `frontend/` in one terminal and run automation from `automation/` in another.

## Repository layout

| Path | Role |
| --- | --- |
| [`frontend/`](../frontend/) | Next.js 14 UI. Serves pages + a runtime copy of `/api/*`. |
| [`backend/`](../backend/) | API handlers (`app/api/**`) — STLC/contract source of truth |
| [`automation/`](../automation/) | Playwright + STLC orchestrator |

## Fixture postcodes

| Postcode | Behaviour |
| --- | --- |
| `SW1A 1AA` | 12 addresses |
| `EC1A 1BB` | 0 addresses → empty state, manual address |
| `M1 1AE` | Slow lookup (~2.2s) |
| `BS1 4DJ` | First request **500**, retry succeeds |

**Waste:** General · Heavy (disables **12-yard** & **14-yard**) · Plasterboard (three handling options; “Dedicated” also disables **2-yard** & **3-yard**).

## API

| Method | Endpoint |
| --- | --- |
| `POST` | `/api/postcode/lookup` |
| `POST` | `/api/waste-types` |
| `GET` | `/api/skips?postcode=…&heavyWaste=…` |
| `POST` | `/api/booking/confirm` |

## Mocking & data

- No external APIs: responses are built in [`backend/app/api/`](../backend/app/api/) using [`frontend/lib/fixtures.ts`](lib/fixtures.ts) (mirrored under `backend/lib/`).
- `BS1 4DJ` uses in-process state in `lib/postcode-state.ts`.
- E2E drives the real UI; no extra HTTP mocks beyond the app.

## Submission artifacts

With the app running at **http://localhost:3000**, run the checks below. Each command tells you what to expect in the output.

### Lighthouse

```bash
npx lighthouse http://localhost:3000 --only-categories=performance,accessibility,best-practices,seo --view
```

**What you’ll see:** Lighthouse finishes in the terminal with a short summary (scores and URL), then opens the **HTML report** in your default browser. The report shows **four category scores** (Performance, Accessibility, Best Practices, SEO) on a 0–100 scale, then expandable sections: metrics (e.g. First Contentful Paint, Largest Contentful Paint where applicable), opportunities, diagnostics, and passed audits. The **Accessibility** section lists specific checks (pass/fail) and links to documentation for each.

### A11y (axe)

```bash
npx @axe-core/cli http://localhost:3000
```

**What you’ll see:** The CLI prints a **text summary** to the terminal: counts of violations, passes, and incomplete checks, followed by **per-issue lines** (rule id, impact, short description, and selector or snippet) when violations exist. If there are **no** accessibility violations for the loaded page, the output states that the page has no violations (or equivalent zero-violation summary). Exit code is non-zero when violations are found, so CI can fail on regressions.
