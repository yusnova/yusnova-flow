# Skill: MCP Server, Quality Dashboard & Bug-Hunter Explorer
> Read this before wiring the STLC pipeline into Cursor/chat, building on the dashboard, or extending the exploration agent.

## What these three things are

| Tool | Path | Purpose |
|------|------|---------|
| MCP server | `scripts/mcp-server/` | Exposes the STLC pipeline as MCP tools so Cursor (or any MCP client) can call it from chat |
| Quality dashboard | `scripts/dashboard/` | Local web UI over run history, self-healing review, and flaky test reports |
| Bug-hunter explorer | `scripts/explorer-agent/` | Autonomous crawl-and-flag agent — no test cases needed |

All three share ONE source of truth for handlers: `scripts/mcp-server/handlers.ts`. The dashboard imports from it directly; the MCP server wraps it in `registerTool()` calls. Never duplicate approve/reject/list logic — add it to `handlers.ts` (or the lower-level `stlc-orchestrator/healing/proposal-actions.ts`) once and reuse.

## MCP server

```bash
cd automation
npm run mcp:server   # starts stdio MCP server (for manual testing / debugging)
```

Register with Cursor by adding to `.cursor/mcp.json` (project or user-level):

```json
{
  "mcpServers": {
    "stlc": {
      "command": "npx",
      "args": ["ts-node", "scripts/mcp-server/server.ts"],
      "cwd": "/absolute/path/to/repo/automation"
    }
  }
}
```

Tools exposed (see `server.ts` for full schemas): `stlc_list_runs`, `stlc_get_run`, `stlc_get_report`, `stlc_list_healing_proposals`, `stlc_approve_healing_proposal`, `stlc_reject_healing_proposal`, `stlc_approve_all_healing_proposals`, `stlc_flaky_report`, `stlc_test_impact`, `stlc_list_domains`, `stlc_validate_domain`, `stlc_run_pipeline`, `stlc_explore_bugs`.

**Safety contract (do not break this):** `stlc_approve_healing_proposal` / `stlc_approve_all_healing_proposals` are the only tools that write to POM/spec files, and only do so for the exact proposal id(s) passed in. Every tool description explicitly tells the calling model to only invoke approval tools when a human explicitly asked for that decision — never proactively or speculatively. This mirrors the `npm run healing:review` CLI contract in `06-stlc-orchestrator.md`.

## Quality dashboard

```bash
cd automation
npm run dashboard              # http://localhost:4790
DASHBOARD_PORT=5000 npm run dashboard   # custom port
```

Zero build step: static HTML/CSS/JS in `scripts/dashboard/public/`, `node:http` for the API in `scripts/dashboard/server.ts`. Tabs: **Runs** (click a row to view `quality-report.md`), **Self-Healing** (approve/reject with confirmation — writes to disk exactly like the CLI), **Flaky Tests**, **Test Impact** (paste changed file paths, see affected domains).

Extension rule: add new routes to `server.ts`, new handler functions to `handlers.ts` (never inline pipeline logic in the HTTP layer), and new UI in `public/app.js` (vanilla JS, no framework — keep it that way unless the UI genuinely outgrows it).

## Bug-hunter explorer agent

```bash
cd automation
npm run explore:bugs -- --url https://<host>/ --domain checkout --max-pages 8 --headless
npm run explore:bugs -- --url https://<host>/ --domain checkout --ingest-rag --skip-human-gates
npm run explore:bugs   # interactive wizard when --url omitted
```

**Same pattern as `stlc:orchestrator`:** phase runners + `state.json` + audit trail + quality gate.

| Phase | What it does |
|-------|----------------|
| `setup` | Validate URL / budget |
| `crawl` | BFS bug-hunt (`BugHunterAgent`) |
| `triage` | Anomalies → defects (marks likely validation-copy as noise) |
| `review` | Human gate if open critical findings (`--skip-human-gates` to auto-ack) |
| `reporting` | `exploration-report.md` + quality gate |
| `rag` | Optional `--ingest-rag` into `DefectKnowledgeBase` |

Detectors live in `scripts/explorer-agent/detectors.ts`:
- `console_error` / `page_error` — browser console errors and uncaught JS exceptions
- `network_error` — failed requests and 4xx/5xx responses
- `error_text_on_page` — regex signatures for leaked stack traces, 5xx text, `[object Object]`, `NaN`, generic error-boundary copy
- `broken_image` — `<img>` with `naturalWidth === 0` after load

Output: `tmp/stlc/exploration/{runId}/{state.json, exploration-report.md, anomalies.json, screenshots/}`.

`--ingest-rag` converts open critical/major defects into `DefectRecord`s and feeds them into `DefectKnowledgeBase.ingestFromDefects()` (same RAG store the requirements/design agents query).

**Not the same as STLC `--explore`** (that is codegen `PageExplorer` for selectors). Explore does **not** run inside CI by default and does **not** modify product/test code — only reports under `tmp/stlc/exploration/`. Old runs are auto-pruned (`STLC_TMP_KEEP_RUNS` / `STLC_TMP_MAX_AGE_DAYS`, or `--no-tmp-prune`).

### Extending detectors

Add new signatures to `ERROR_TEXT_PATTERNS` in `detectors.ts` (keep them specific — this list intentionally avoids matching the literal word "error" to keep noise low). Add new anomaly types to `AnomalyType` in `types.ts` and wire a new listener/scan function the same way `attachAnomalyListeners` / `scanVisibleErrorText` are wired.

### Extending phases

Add a runner under `scripts/explorer-agent/agents/`, register it in `orchestrator.ts` `PHASE_RUNNERS`, extend `ExplorePhase` + `DEFAULT_EXPLORE_PHASE_ORDER` in `state.ts` / `types.ts`. Keep the STLC-style contract: every phase appends an audit entry and returns `{ nextPhase, state }`.
