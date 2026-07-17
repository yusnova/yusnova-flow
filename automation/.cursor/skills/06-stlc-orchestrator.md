# Skill: STLC Orchestrator Usage
> Read this before running the agentic STLC pipeline or extending orchestrator agents.

## What it is

`stlc:orchestrator` runs a multi-phase, auditable STLC pipeline. It does NOT replace `codegen:agent` — it wraps it as one phase inside a larger flow.

## Phases and agents

| Phase | Agent | Role |
|-------|-------|------|
| requirements | requirements-agent | Ambiguity flags, testability score, AC extraction |
| planning | planning-agent | Risk matrix, scope, test pyramid preference (API before UI) |
| design | design-agent | Test case design + negative/boundary variants |
| review_design | review-agent | Coverage gaps, duplicates, human gate for P0 |
| codegen | codegen-bridge-agent | Calls existing `runCodegenPipeline()` |
| review_code | review-agent | Runs `npm run validate:conventions -- --domain` |
| execution | execution-agent | Optional Playwright run (`--run-tests`) |
| triage | triage-agent | Failure dedup + defect hypotheses |
| reporting | reporting-agent | Quality gate recommendation (human decides go/no-go) |

## CLI

```bash
cd automation
npm run stlc:orchestrator -- \
  --url https://demo.example.com/products \
  --domain inventory \
  --page InventoryPage \
  --requirement-file ./requirements/example.md \
  --overwrite
```

With execution:

```bash
npm run stlc:orchestrator -- \
  --url https://demo.example.com/products \
  --domain inventory \
  --page InventoryPage \
  --requirement "AC: User can sort products by price" \
  --run-tests \
  --skip-human-gates
```

## Outputs

- `tmp/stlc/{runId}/state.json` — full SharedState + audit_trail
- `tmp/stlc/{runId}/quality-report.md` — human-readable gate summary

## Extension rules

- Add new agents under `scripts/stlc-orchestrator/agents/`
- Register phase in `orchestrator.ts` PHASE_RUNNERS
- Every state mutation must call `appendAudit()` with `reason` and `confidence`
- Do NOT move Playwright fixtures or domain code into orchestrator
- Reuse `codegen-agent` writers — never duplicate POM/spec generation logic

## Human gates

P0 cases and validator failures create `humanGates` entries with `status: pending`.
Use `--skip-human-gates` only for local POC — never in production CI without explicit approval.

## LLM integration

Set in `.env` or CI secrets:

```
STLC_LLM_API_KEY=...
STLC_LLM_BASE_URL=https://api.openai.com/v1   # optional
STLC_LLM_MODEL=gpt-4o-mini                    # optional
```

- `requirements-agent` and `design-agent` call LLM when key is present
- Without key: heuristic fallback (no failure)
- Disable explicitly: `--no-llm`

## Flaky test intelligence

- `execution-agent` records every pass/fail into `tmp/stlc/knowledge/test-history.json`
  (per domain + case id, last 20 runs kept) via `flaky/test-history.ts`.
- Flaky score = 0.5 × "mixedness" (how close to 50/50 pass/fail) + 0.5 × "flip
  rate" (how often consecutive runs disagree). A test that always fails is a
  regression, not flaky — it scores 0.
- `triage-agent` checks history before opening a defect: a failing test with a
  historical flaky score ≥ 0.5 gets severity downgraded to `minor` instead of
  `major`/`critical`, so it does not block the quality gate on its own.
- Inspect anytime: `npm run flaky:report -- --domain <domain>`.
- Surfaced in every run's `quality-report.md` under "## Flaky tests".

## RAG (defect patterns)

- Knowledge file: `tmp/stlc/knowledge/defect-patterns.json`
- Seed data: `tmp/stlc/knowledge/defect-patterns.seed.json`
- Embedding cache: `tmp/stlc/knowledge/defect-embeddings.json` (per-pattern vectors, content-hashed so stale entries auto-recompute)
- `requirements-agent` searches patterns (`await rag.search(...)`) and adds high-risk ambiguity flags
- `triage-agent` ingests new defects after nightly runs (feedback loop)
- Disable: `--no-rag`

### Hybrid keyword + semantic search

`DefectKnowledgeBase.search()` is async and blends two signals:

- **Keyword overlap** (always available, zero dependencies) — same as before.
- **Semantic similarity** (cosine similarity over embeddings) — only when
  `STLC_LLM_API_KEY` is set. Uses `STLC_EMBEDDING_MODEL` (default
  `text-embedding-3-small`) via the OpenAI-compatible `/embeddings` endpoint
  (`rag/embeddings.ts`).
- Final score = `max(keyword, 0.4·keyword + 0.6·semantic)` — this lets a
  paraphrased requirement match a historical defect with zero literal keyword
  overlap (e.g. "cart" ↔ "basket").
- If the embedding API call fails for any reason, `search()` falls back to
  keyword-only silently — never throws, never blocks the pipeline.
- `DefectKnowledgeBase` accepts an injectable `EmbeddingProvider` in its
  constructor for testing without network calls (see
  `rag/defect-knowledge.test.ts`).

## Self-healing (human approval required)

- `execution-agent` detects locator failures and only ever *proposes* fixes — it
  never writes to POM/spec files itself. Every proposal is created with
  `status: pending_human`.
- Review and apply via the CLI (the **only** code path allowed to touch POM/spec
  files for healing):

  ```bash
  npm run healing:review -- --run <runId>                          # list pending proposals
  npm run healing:review -- --run <runId> --approve HEAL-123        # approve + apply one
  npm run healing:review -- --run <runId> --reject HEAL-123         # reject one
  npm run healing:review -- --run <runId> --approve-all --min-confidence 0.8
  npm run healing:review -- --list-runs                             # find runs with pending proposals
  ```

- `--approve` / `--approve-all` call `applyHealingProposals()` in
  `healing/auto-healer.ts`, which only writes selectors whose proposal has
  `status: approved` and always skips lines tagged `@stlc:manual`.
- Every approve/reject decision is appended to `auditTrail` with
  `agent: healing-review-cli` for full traceability.
- Disable proposal generation entirely: `--no-self-healing`.

> Do not reintroduce automatic writes inside `execution-agent.ts` or
> `buildAutoHealProposals()` — the `autoApplicable` flag on a proposal is only a
> confidence/eligibility hint for the review CLI, not permission to skip human
> review.

## CI profiles

| Trigger | Workflow | Profile | Phases |
|---------|----------|---------|--------|
| Pull request | `.github/workflows/stlc-pr.yml` | `--profile pr` | requirements → review_code → reporting |
| Nightly / manual | `.github/workflows/stlc-nightly.yml` | `--profile full` | all phases + `--run-tests` |

GitHub secrets needed: `STLC_LLM_API_KEY`, `REGULAR_USER_USERNAME`, `REGULAR_USER_PASSWORD`

Custom phase list:

```bash
npm run stlc:orchestrator -- ... --phases requirements,design,codegen,review_code,reporting
```
