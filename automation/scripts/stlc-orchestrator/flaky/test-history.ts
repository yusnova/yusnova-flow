import * as fs from 'node:fs'
import * as path from 'node:path'
import { ExecutionResult, FlakyTestSummary } from '../types'

export type RunStatus = ExecutionResult['status']

export interface TestRunRecord {
  runId: string
  timestamp: string
  status: RunStatus
}

export interface TestHistoryEntry {
  caseId: string
  domain: string
  runs: TestRunRecord[]
  flakyScore: number
  lastUpdated: string
}

export type TestHistoryStore = Record<string, TestHistoryEntry>

const DEFAULT_KNOWLEDGE_DIR = path.resolve(__dirname, '..', '..', '..', 'tmp/stlc/knowledge')
const HISTORY_FILE = 'test-history.json'
const MAX_WINDOW = 20
const MIN_SAMPLES_FOR_SCORE = 3

export const FLAKY_MONITOR_THRESHOLD = 0.3
export const FLAKY_QUARANTINE_THRESHOLD = 0.5

function historyKey(domain: string, caseId: string): string {
  return `${domain}::${caseId}`
}

/**
 * Flaky score combines two signals over the run window:
 * - "mixedness": how close the pass/fail split is to 50/50 (a test that is
 *   ALWAYS failing is a real regression, not flaky — mixedness is 0 there).
 * - "flip rate": how often consecutive runs disagree (alternating pass/fail
 *   is the clearest flaky signature).
 * Requires a minimum sample size; otherwise there isn't enough history to
 * distinguish "flaky" from "just failed once".
 */
export function computeFlakyScore(runs: TestRunRecord[]): number {
  const relevant = runs.filter((run) => run.status === 'passed' || run.status === 'failed')
  if (relevant.length < MIN_SAMPLES_FOR_SCORE) return 0

  const passCount = relevant.filter((run) => run.status === 'passed').length
  const passRate = passCount / relevant.length
  const mixedness = 1 - Math.abs(2 * passRate - 1)

  let flips = 0
  for (let i = 1; i < relevant.length; i += 1) {
    if (relevant[i]!.status !== relevant[i - 1]!.status) flips += 1
  }
  const flipRate = relevant.length > 1 ? flips / (relevant.length - 1) : 0

  const score = 0.5 * mixedness + 0.5 * flipRate
  return Math.round(score * 100) / 100
}

function recommendationFor(score: number, sampleSize: number): FlakyTestSummary['recommendation'] {
  if (sampleSize < MIN_SAMPLES_FOR_SCORE) return 'stable'
  if (score >= FLAKY_QUARANTINE_THRESHOLD) return 'quarantine_candidate'
  if (score >= FLAKY_MONITOR_THRESHOLD) return 'monitor'
  return 'stable'
}

export class TestHistoryTracker {
  constructor(private readonly knowledgeDir = DEFAULT_KNOWLEDGE_DIR) {}

  private filePath(): string {
    return path.join(this.knowledgeDir, HISTORY_FILE)
  }

  load(): TestHistoryStore {
    const file = this.filePath()
    if (!fs.existsSync(file)) return {}
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as TestHistoryStore
    } catch {
      return {}
    }
  }

  save(store: TestHistoryStore): void {
    fs.mkdirSync(this.knowledgeDir, { recursive: true })
    fs.writeFileSync(this.filePath(), JSON.stringify(store, null, 2), 'utf-8')
  }

  /**
   * Appends this run's results to history and returns the updated summaries
   * for every case touched in this run (used by execution-agent to populate
   * real ExecutionResult.flakyScore instead of a hardcoded placeholder).
   */
  record(domain: string, runId: string, results: ExecutionResult[]): FlakyTestSummary[] {
    const store = this.load()
    const timestamp = new Date().toISOString()
    const touched: FlakyTestSummary[] = []

    for (const result of results) {
      if (result.status !== 'passed' && result.status !== 'failed') continue

      const key = historyKey(domain, result.caseId)
      const entry: TestHistoryEntry = store[key] ?? {
        caseId: result.caseId,
        domain,
        runs: [],
        flakyScore: 0,
        lastUpdated: timestamp,
      }

      entry.runs = [...entry.runs, { runId, timestamp, status: result.status }].slice(-MAX_WINDOW)
      entry.flakyScore = computeFlakyScore(entry.runs)
      entry.lastUpdated = timestamp
      store[key] = entry

      touched.push({
        caseId: entry.caseId,
        domain: entry.domain,
        flakyScore: entry.flakyScore,
        sampleSize: entry.runs.length,
        lastStatuses: entry.runs.slice(-5).map((run) => run.status),
        recommendation: recommendationFor(entry.flakyScore, entry.runs.length),
      })
    }

    this.save(store)
    return touched
  }

  summary(domain?: string): FlakyTestSummary[] {
    const store = this.load()
    return Object.values(store)
      .filter((entry) => !domain || entry.domain === domain)
      .map((entry) => ({
        caseId: entry.caseId,
        domain: entry.domain,
        flakyScore: entry.flakyScore,
        sampleSize: entry.runs.length,
        lastStatuses: entry.runs.slice(-5).map((run) => run.status),
        recommendation: recommendationFor(entry.flakyScore, entry.runs.length),
      }))
      .sort((a, b) => b.flakyScore - a.flakyScore)
  }

  flakyTests(domain?: string, threshold = FLAKY_MONITOR_THRESHOLD): FlakyTestSummary[] {
    return this.summary(domain).filter((entry) => entry.flakyScore >= threshold)
  }

  isKnownFlaky(domain: string, caseId: string, threshold = FLAKY_QUARANTINE_THRESHOLD): boolean {
    const store = this.load()
    const entry = store[historyKey(domain, caseId)]
    return Boolean(entry && entry.flakyScore >= threshold && entry.runs.length >= MIN_SAMPLES_FOR_SCORE)
  }
}
