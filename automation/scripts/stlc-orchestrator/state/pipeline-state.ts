import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  AuditEntry,
  OrchestratorOptions,
  QualityGate,
  StlcPhase,
  StlcSharedState,
  TestScope,
} from '../types'

export function createInitialState(
  requirementText: string,
  options: OrchestratorOptions,
): StlcSharedState {
  const emptyScope: TestScope = { inScope: [], outOfScope: [], riskMatrix: [] }
  const emptyGate: QualityGate = {
    decision: 'pending',
    blockingReasons: [],
    coveragePercent: 0,
    openP0Count: 0,
    recommendation: '',
    confidence: 0,
  }

  return {
    runId: randomUUID(),
    requirementText,
    ambiguityFlags: [],
    testabilityScore: 0,
    acceptanceCriteria: [],
    testScope: emptyScope,
    testCases: [],
    executionResults: [],
    defects: [],
    humanGates: [],
    qualityGate: emptyGate,
    auditTrail: [],
    codegen: options.codegen,
    currentPhase: 'requirements',
  }
}

export function appendAudit(
  state: StlcSharedState,
  entry: Omit<AuditEntry, 'timestamp'>,
): StlcSharedState {
  const auditTrail = [
    ...state.auditTrail,
    { ...entry, timestamp: new Date().toISOString() },
  ]
  return { ...state, auditTrail }
}

export function saveState(state: StlcSharedState, outputDir: string): string {
  const runDir = path.join(outputDir, state.runId)
  fs.mkdirSync(runDir, { recursive: true })
  const filePath = path.join(runDir, 'state.json')
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
  return filePath
}

export function loadState(outputDir: string, runId: string): StlcSharedState {
  const filePath = path.join(outputDir, runId, 'state.json')
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as StlcSharedState
}

export const DEFAULT_PHASE_ORDER: StlcPhase[] = [
  'requirements',
  'planning',
  'design',
  'review_design',
  'codegen',
  'review_code',
  'execution',
  'triage',
  'reporting',
  'done',
]

export function nextPhaseInOrder(current: StlcPhase, order = DEFAULT_PHASE_ORDER): StlcPhase {
  const index = order.indexOf(current)
  if (index < 0 || index >= order.length - 1) return 'done'
  return order[index + 1]!
}
