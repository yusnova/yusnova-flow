import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  ExploreAuditEntry,
  ExploreOrchestratorOptions,
  ExplorePhase,
  ExploreQualityGate,
  ExploreSharedState,
} from './types'

export const DEFAULT_EXPLORE_PHASE_ORDER: ExplorePhase[] = [
  'setup',
  'crawl',
  'triage',
  'review',
  'reporting',
  'rag',
  'done',
]

export function createInitialExploreState(options: ExploreOrchestratorOptions): ExploreSharedState {
  const emptyGate: ExploreQualityGate = {
    decision: 'pending',
    blockingReasons: [],
    criticalCount: 0,
    majorCount: 0,
    minorCount: 0,
    recommendation: '',
    confidence: 0,
  }

  return {
    runId: `explore-${randomUUID().slice(0, 8)}`,
    url: options.url,
    domain: options.domain,
    pagesVisited: [],
    actionsPerformed: 0,
    anomalies: [],
    defects: [],
    humanGates: [],
    qualityGate: emptyGate,
    auditTrail: [],
    ragIngestedIds: [],
    currentPhase: 'setup',
  }
}

export function appendExploreAudit(
  state: ExploreSharedState,
  entry: Omit<ExploreAuditEntry, 'timestamp'>,
): ExploreSharedState {
  return {
    ...state,
    auditTrail: [...state.auditTrail, { ...entry, timestamp: new Date().toISOString() }],
  }
}

export function saveExploreState(state: ExploreSharedState, outputDir: string): string {
  const runDir = path.join(outputDir, state.runId)
  fs.mkdirSync(runDir, { recursive: true })
  const filePath = path.join(runDir, 'state.json')
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
  return filePath
}

export function loadExploreState(outputDir: string, runId: string): ExploreSharedState {
  const filePath = path.join(outputDir, runId, 'state.json')
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ExploreSharedState
}

export function nextExplorePhase(
  current: ExplorePhase,
  order = DEFAULT_EXPLORE_PHASE_ORDER,
): ExplorePhase {
  const index = order.indexOf(current)
  if (index < 0 || index >= order.length - 1) return 'done'
  return order[index + 1]!
}

export function countExplorePhases(order: ExplorePhase[]): number {
  return order.filter((phase) => phase !== 'done').length
}
