#!/usr/bin/env ts-node
/**
 * Quality Intelligence Dashboard — a small local web UI over the same
 * handlers used by the MCP server and the `healing:review` CLI (see
 * `scripts/mcp-server/handlers.ts`). Zero build step: static HTML/CSS/JS in
 * `public/`, plain `node:http` for the API. No new frontend framework
 * dependency required.
 *
 * Run: npm run dashboard   (defaults to http://localhost:4790)
 * Port override: DASHBOARD_PORT=5000 npm run dashboard
 */
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import * as url from 'node:url'
import * as dotenv from 'dotenv'
import {
  AUTOMATION_ROOT,
  DEFAULT_OUTPUT,
  approveAllHealingProposals,
  approveHealingProposal,
  domains,
  flakyReport,
  getRun,
  getRunReport,
  listHealingProposals,
  listRuns,
  rejectHealingProposal,
  testImpact,
} from '../mcp-server/handlers'
import { HealingProposal } from '../stlc-orchestrator/types'

dotenv.config({ path: path.join(AUTOMATION_ROOT, '.env') })

const PORT = Number(process.env.DASHBOARD_PORT ?? 4790)
const PUBLIC_DIR = path.join(__dirname, 'public')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function sendText(res: http.ServerResponse, status: number, text: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(text) })
  res.end(text)
}

function sendFile(res: http.ServerResponse, filePath: string): void {
  if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: `not found: ${path.basename(filePath)}` })
  const ext = path.extname(filePath)
  const contentType = MIME[ext] ?? 'application/octet-stream'
  const body = fs.readFileSync(filePath)
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length })
  res.end(body)
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  } catch {
    return {}
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type StatusFilter = HealingProposal['status'] | 'all'

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url ?? '/', true)
  const pathname = parsed.pathname ?? '/'
  const method = req.method ?? 'GET'

  try {
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return sendFile(res, path.join(PUBLIC_DIR, 'index.html'))
    }
    if (method === 'GET' && (pathname === '/app.js' || pathname === '/style.css')) {
      return sendFile(res, path.join(PUBLIC_DIR, pathname.slice(1)))
    }

    if (method === 'GET' && pathname === '/api/runs') {
      return sendJson(res, 200, listRuns(DEFAULT_OUTPUT, Number(parsed.query.limit ?? 50)))
    }

    const reportMatch = pathname.match(/^\/api\/runs\/([^/]+)\/report$/)
    if (method === 'GET' && reportMatch) {
      const runId = decodeURIComponent(reportMatch[1]!)
      try {
        return sendText(res, 200, getRunReport(runId), 'text/markdown; charset=utf-8')
      } catch (error) {
        return sendJson(res, 404, { error: errorMessage(error) })
      }
    }

    const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/)
    if (method === 'GET' && runMatch) {
      const runId = decodeURIComponent(runMatch[1]!)
      try {
        return sendJson(res, 200, getRun(runId))
      } catch (error) {
        return sendJson(res, 404, { error: errorMessage(error) })
      }
    }

    if (method === 'GET' && pathname === '/api/healing') {
      const runId = typeof parsed.query.runId === 'string' ? parsed.query.runId : undefined
      const status = (typeof parsed.query.status === 'string' ? parsed.query.status : 'pending_human') as StatusFilter
      return sendJson(res, 200, listHealingProposals({ runId, status }))
    }

    const decisionMatch = pathname.match(/^\/api\/healing\/([^/]+)\/([^/]+)\/(approve|reject)$/)
    if (method === 'POST' && decisionMatch) {
      const runId = decodeURIComponent(decisionMatch[1]!)
      const proposalId = decodeURIComponent(decisionMatch[2]!)
      const action = decisionMatch[3] as 'approve' | 'reject'
      const body = await readJsonBody(req)
      const reason = typeof body.reason === 'string' ? body.reason : undefined
      try {
        const result = action === 'approve'
          ? approveHealingProposal(runId, proposalId, reason)
          : rejectHealingProposal(runId, proposalId, reason)
        return sendJson(res, 200, result)
      } catch (error) {
        return sendJson(res, 500, { error: errorMessage(error) })
      }
    }

    const approveAllMatch = pathname.match(/^\/api\/healing\/([^/]+)\/approve-all$/)
    if (method === 'POST' && approveAllMatch) {
      const runId = decodeURIComponent(approveAllMatch[1]!)
      const body = await readJsonBody(req)
      const minConfidence = typeof body.minConfidence === 'number' ? body.minConfidence : 0.75
      try {
        return sendJson(res, 200, approveAllHealingProposals(runId, minConfidence))
      } catch (error) {
        return sendJson(res, 500, { error: errorMessage(error) })
      }
    }

    if (method === 'GET' && pathname === '/api/flaky') {
      const domain = typeof parsed.query.domain === 'string' ? parsed.query.domain : undefined
      const minScore = Number(parsed.query.minScore ?? 0.3)
      return sendJson(res, 200, flakyReport(domain, minScore))
    }

    if (method === 'GET' && pathname === '/api/domains') {
      return sendJson(res, 200, domains())
    }

    if (method === 'POST' && pathname === '/api/impact') {
      const body = await readJsonBody(req)
      const changedFiles = Array.isArray(body.changedFiles) ? (body.changedFiles as string[]) : []
      if (changedFiles.length === 0) return sendJson(res, 400, { error: 'changedFiles must be a non-empty array' })
      return sendJson(res, 200, testImpact(changedFiles))
    }

    sendJson(res, 404, { error: `no route for ${method} ${pathname}` })
  } catch (error) {
    sendJson(res, 500, { error: errorMessage(error) })
  }
})

server.listen(PORT, () => {
  console.log(`\n\x1b[1mSTLC Quality Dashboard\x1b[0m running at \x1b[36mhttp://localhost:${PORT}\x1b[0m`)
  console.log(`Reading runs from: ${DEFAULT_OUTPUT}\n`)
})
