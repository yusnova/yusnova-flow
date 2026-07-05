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
| review_code | review-agent | Runs `npm run validate -- --domain` |
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
  --requirement-file ./requirements/inventory.md \
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

## RAG (defect patterns)

- Knowledge file: `tmp/stlc/knowledge/defect-patterns.json`
- Seed data: `tmp/stlc/knowledge/defect-patterns.seed.json`
- `requirements-agent` searches patterns and adds high-risk ambiguity flags
- `triage-agent` ingests new defects after nightly runs (feedback loop)
- Disable: `--no-rag`

Upgrade path: replace keyword search in `rag/defect-knowledge.ts` with embeddings (pgvector / OpenAI embeddings).

## Self-healing (human approval required)

- `execution-agent` detects locator failures
- Creates `healingProposals[]` with `status: pending_human`
- Never auto-applies selector changes to POM
- Review proposals in `state.json`, then manually apply or build `healing/apply-proposal.ts` CLI later
- Disable: `--no-self-healing`

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
