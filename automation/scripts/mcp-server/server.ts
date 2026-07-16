#!/usr/bin/env ts-node
/**
 * MCP server exposing the STLC pipeline (requirements → codegen → execution →
 * self-healing → flaky intelligence) as tools that Cursor (or any MCP
 * client) can call directly from chat.
 *
 * This is a thin wrapper: every tool delegates to `handlers.ts`, which is
 * the same code used by `healing:review` CLI logic and the dashboard. No
 * tool here bypasses the human-approval contract — `stlc_approve_healing`
 * only writes to POM/spec files when a specific proposal id is passed, i.e.
 * when a human (via chat) explicitly asked for that fix to be applied.
 *
 * Run standalone:
 *   npm run mcp:server
 *
 * Register in Cursor (~/.cursor/mcp.json or project .cursor/mcp.json):
 *   {
 *     "mcpServers": {
 *       "stlc": {
 *         "command": "npx",
 *         "args": ["ts-node", "scripts/mcp-server/server.ts"],
 *         "cwd": "<repo>/automation"
 *       }
 *     }
 *   }
 */
import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  AUTOMATION_ROOT,
  DEFAULT_OUTPUT,
  approveAllHealingProposals,
  approveHealingProposal,
  domains,
  exploreBugs,
  flakyReport,
  getRun,
  getRunReport,
  listHealingProposals,
  listRuns,
  rejectHealingProposal,
  runPipeline,
  testImpact,
  validateDomain,
} from './handlers'

dotenv.config({ path: path.join(AUTOMATION_ROOT, '.env') })

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

const server = new McpServer({ name: 'yusnova-stlc', version: '1.0.0' })

server.registerTool(
  'stlc_list_runs',
  {
    title: 'List STLC runs',
    description:
      'List recent agentic STLC pipeline runs (most recently updated first), with quality gate decision, ' +
      'coverage %, pending human gates, and pending self-healing proposal counts for each.',
    inputSchema: {
      outputDir: z.string().optional().describe('STLC output directory (default: tmp/stlc)'),
      limit: z.number().int().positive().optional().describe('Max runs to return (default: 20)'),
    },
  },
  async ({ outputDir, limit }) => {
    try {
      return jsonResult(listRuns(outputDir ?? DEFAULT_OUTPUT, limit ?? 20))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_get_run',
  {
    title: 'Get STLC run state',
    description: 'Get the full shared state (test cases, defects, audit trail, healing proposals, etc.) for one STLC run.',
    inputSchema: {
      runId: z.string().describe('Run id (folder name under tmp/stlc/)'),
      outputDir: z.string().optional(),
    },
  },
  async ({ runId, outputDir }) => {
    try {
      return jsonResult(getRun(runId, outputDir ?? DEFAULT_OUTPUT))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_get_report',
  {
    title: 'Get STLC quality report',
    description: 'Get the human-readable quality-report.md markdown for one STLC run.',
    inputSchema: {
      runId: z.string().describe('Run id (folder name under tmp/stlc/)'),
      outputDir: z.string().optional(),
    },
  },
  async ({ runId, outputDir }) => {
    try {
      return { content: [{ type: 'text' as const, text: getRunReport(runId, outputDir ?? DEFAULT_OUTPUT) }] }
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_list_healing_proposals',
  {
    title: 'List self-healing proposals',
    description:
      'List self-healing selector-fix proposals (across one run or all runs). Defaults to only ' +
      '"pending_human" proposals — the ones awaiting a decision. These are PROPOSALS ONLY: nothing has ' +
      'been written to any POM/spec file yet.',
    inputSchema: {
      runId: z.string().optional().describe('Limit to one run id; omit to scan all runs'),
      status: z.enum(['pending_human', 'approved', 'applied', 'rejected', 'all']).optional(),
      outputDir: z.string().optional(),
    },
  },
  async ({ runId, status, outputDir }) => {
    try {
      return jsonResult(listHealingProposals({ runId, status, outputDir: outputDir ?? DEFAULT_OUTPUT }))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_approve_healing_proposal',
  {
    title: 'Approve a self-healing proposal (writes to POM/spec file)',
    description:
      'Approve ONE self-healing proposal by id and immediately apply it to the POM/spec file. ' +
      'ONLY call this when a human has explicitly asked for this specific proposal id to be approved — ' +
      'never call this proactively or in bulk without being asked. This is the same code path as ' +
      '`npm run healing:review -- --approve`.',
    inputSchema: {
      runId: z.string().describe('Run id the proposal belongs to'),
      proposalId: z.string().describe('Proposal id, e.g. "HEAL-1700000000-1"'),
      reason: z.string().optional().describe('Optional note recorded in the audit trail'),
      outputDir: z.string().optional(),
    },
  },
  async ({ runId, proposalId, reason, outputDir }) => {
    try {
      return jsonResult(approveHealingProposal(runId, proposalId, reason, outputDir ?? DEFAULT_OUTPUT))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_reject_healing_proposal',
  {
    title: 'Reject a self-healing proposal (no files changed)',
    description: 'Reject ONE self-healing proposal by id. No files are changed; the proposal is marked "rejected" for audit purposes.',
    inputSchema: {
      runId: z.string(),
      proposalId: z.string(),
      reason: z.string().optional(),
      outputDir: z.string().optional(),
    },
  },
  async ({ runId, proposalId, reason, outputDir }) => {
    try {
      return jsonResult(rejectHealingProposal(runId, proposalId, reason, outputDir ?? DEFAULT_OUTPUT))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_approve_all_healing_proposals',
  {
    title: 'Bulk-approve high-confidence self-healing proposals',
    description:
      'Approve + apply every pending self-healing proposal in a run whose confidence is >= minConfidence. ' +
      'ONLY call this when a human explicitly asked to bulk-approve (e.g. "approve all fixes above 90% confidence ' +
      'for run X"). Equivalent to `npm run healing:review -- --approve-all`.',
    inputSchema: {
      runId: z.string(),
      minConfidence: z.number().min(0).max(1).optional().describe('Default 0.75'),
      outputDir: z.string().optional(),
    },
  },
  async ({ runId, minConfidence, outputDir }) => {
    try {
      return jsonResult(approveAllHealingProposals(runId, minConfidence ?? 0.75, outputDir ?? DEFAULT_OUTPUT))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_flaky_report',
  {
    title: 'Flaky test report',
    description:
      'List tests flagged as flaky (or quarantine candidates) from historical execution data, ' +
      'with pass/fail history and a flakiness score.',
    inputSchema: {
      domain: z.string().optional().describe('Limit to one domain'),
      minScore: z.number().min(0).max(1).optional().describe('Minimum flaky score, default 0.3'),
    },
  },
  async ({ domain, minScore }) => {
    try {
      return jsonResult(flakyReport(domain, minScore ?? 0.3))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_test_impact',
  {
    title: 'Analyze test impact of changed files',
    description:
      'Given a list of changed file paths (repo-root-relative or absolute), return which test domains are ' +
      'affected, whether the full suite should run instead, and the reasoning per file. Mirrors the logic used ' +
      'by the CI PR workflow.',
    inputSchema: {
      changedFiles: z.array(z.string()).min(1).describe('Changed file paths, e.g. from `git diff --name-only`'),
    },
  },
  async ({ changedFiles }) => {
    try {
      return jsonResult(testImpact(changedFiles))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_list_domains',
  {
    title: 'List test domains',
    description: 'List all known test domains (folders under automation/domains/).',
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(domains())
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_validate_domain',
  {
    title: 'Validate domain conventions',
    description:
      'Run the automation framework\'s convention validator (naming, fixture wiring, POM patterns) for one domain ' +
      'and return pass/fail plus the raw validator output.',
    inputSchema: {
      domain: z.string().describe('Domain folder name under automation/domains/'),
    },
  },
  async ({ domain }) => {
    try {
      return jsonResult(validateDomain(domain))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_run_pipeline',
  {
    title: 'Run the agentic STLC pipeline (generates tests, optionally executes them)',
    description:
      'Drives a real Playwright browser against `url` to run the agentic STLC pipeline: requirements → ' +
      'planning → design → codegen → review → (optionally) execution → reporting. Generates a POM + spec file ' +
      'under automation/domains/<domain>/. This is a HEAVY, slow tool (can take 20s–several minutes) — only call ' +
      'it when the user explicitly asks to generate/run tests for a page, not speculatively. profile="pr" ' +
      '(default) generates tests without running them; profile="full" also executes Playwright. Any resulting ' +
      'self-healing proposals are left "pending_human" — report them back to the user, do not auto-approve them.',
    inputSchema: {
      url: z.string().describe('Target page URL'),
      domain: z.string().describe('Feature folder name, e.g. "checkout"'),
      page: z.string().describe('POM class name in PascalCase, e.g. "CheckoutPage"'),
      type: z.enum(['ui', 'api', 'e2e']).optional().describe('Default "ui"'),
      requirementText: z.string().optional().describe('Inline acceptance criteria; auto-synthesized from the page if omitted'),
      requirementFile: z.string().optional().describe('Path to a requirement markdown/text file'),
      profile: z.enum(['pr', 'full']).optional().describe('"pr" = generate only (default); "full" = also run tests'),
      runTests: z.boolean().optional(),
      overwrite: z.boolean().optional().describe('Replace existing generated files, default false'),
      headless: z.boolean().optional().describe('Default true (no display in MCP context)'),
      explore: z.boolean().optional().describe('Click-through exploration, default true'),
      skipHumanGates: z.boolean().optional().describe('Auto-approve review gates, default false'),
      enableLlm: z.boolean().optional(),
      enableRag: z.boolean().optional(),
      enableSelfHealing: z.boolean().optional(),
      outputDir: z.string().optional(),
    },
  },
  async (params) => {
    try {
      return jsonResult(await runPipeline(params))
    } catch (error) {
      return errorResult(error)
    }
  },
)

server.registerTool(
  'stlc_explore_bugs',
  {
    title: 'Autonomous bug-hunter exploration',
    description:
      'Drives a real Playwright browser to crawl a live page/app breadth-first, clicking through buttons and ' +
      'links, and flags anomalies: console errors, uncaught JS exceptions, failed/4xx/5xx network calls, ' +
      'visible error text (e.g. "Internal Server Error", stack traces), and broken images — each with a ' +
      'screenshot and action trail. No test cases or requirements needed; this is exploratory QA that ' +
      'complements the scripted STLC pipeline. HEAVY tool (drives a real browser) — only call when the user ' +
      'explicitly asks to explore/crawl/hunt for bugs on a page.',
    inputSchema: {
      url: z.string().describe('Starting URL to explore'),
      maxPages: z.number().int().positive().optional().describe('Max distinct pages to visit, default 5'),
      maxActionsPerPage: z.number().int().positive().optional().describe('Max buttons/controls to click per page, default 15'),
      headless: z.boolean().optional().describe('Default true'),
      sameOriginOnly: z.boolean().optional().describe('Default true — only follow links on the same origin'),
      storageState: z.string().optional().describe('Path to a Playwright storageState JSON for authenticated exploration'),
      outputDir: z.string().optional(),
    },
  },
  async (params) => {
    try {
      return jsonResult(await exploreBugs(params))
    } catch (error) {
      return errorResult(error)
    }
  },
)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[stlc-mcp] server connected over stdio')
}

main().catch((error) => {
  console.error('[stlc-mcp] fatal error:', error)
  process.exit(1)
})
