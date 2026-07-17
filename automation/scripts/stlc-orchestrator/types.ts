import { GeneratorOptions } from '../codegen-agent/types'
import { CodebaseInsights } from '../shared/codebase-scanner'
import { AppScanResult } from '../shared/app-scanner'

export type StlcPhase =
  | 'requirements'
  | 'planning'
  | 'design'
  | 'review_design'
  | 'codegen'
  | 'review_code'
  | 'execution'
  | 'triage'
  | 'reporting'
  | 'done'

export type TestCaseStatus = 'draft' | 'reviewed' | 'approved' | 'automated' | 'rejected'
export type TestLevel = 'unit' | 'api' | 'ui' | 'e2e'
export type HumanGateStatus = 'pending' | 'approved' | 'rejected' | 'skipped'
export type QualityGateDecision = 'go' | 'no_go' | 'conditional' | 'pending'

export interface AuditEntry {
  phase: StlcPhase
  agent: string
  action: string
  reason: string
  confidence: number
  timestamp: string
  inputs?: Record<string, unknown>
}

export interface AmbiguityFlag {
  text: string
  reason: string
  severity: 'low' | 'medium' | 'high'
}

export interface AcceptanceCriterion {
  id: string
  text: string
  testable: boolean
  mappedTestCaseIds: string[]
}

export interface RiskItem {
  module: string
  level: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  recommendedLevel: TestLevel
}

export interface TestScope {
  inScope: string[]
  outOfScope: string[]
  riskMatrix: RiskItem[]
}

export interface DesignedTestCase {
  id: string
  title: string
  level: TestLevel
  type: 'happy-path' | 'negative' | 'boundary' | 'edge'
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  acceptanceCriteriaIds: string[]
  steps: string[]
  status: TestCaseStatus
  confidence: number
  reason: string
}

export interface ExecutionResult {
  caseId: string
  status: 'passed' | 'failed' | 'skipped' | 'flaky'
  evidence?: string
  flakyScore: number
  durationMs?: number
}

export interface DefectRecord {
  id: string
  title: string
  severity: 'blocker' | 'critical' | 'major' | 'minor'
  dedupHash: string
  triageStatus: 'open' | 'duplicate' | 'wont_fix' | 'confirmed'
  rootCauseHypothesis?: string
  linkedCaseIds: string[]
  confidence: number
}

export interface HumanGate {
  phase: StlcPhase
  status: HumanGateStatus
  reason: string
  requiredFor: string[]
}

export interface QualityGate {
  decision: QualityGateDecision
  blockingReasons: string[]
  coveragePercent: number
  openP0Count: number
  recommendation: string
  confidence: number
}

export interface FlakyTestSummary {
  caseId: string
  domain: string
  flakyScore: number
  sampleSize: number
  lastStatuses: Array<ExecutionResult['status']>
  recommendation: 'stable' | 'monitor' | 'quarantine_candidate'
}

export interface HealingProposal {
  id: string
  pomFile: string
  propertyOrMethod: string
  oldSelector: string
  proposedSelector: string
  failureEvidence: string
  confidence: number
  status: 'pending_human' | 'approved' | 'rejected' | 'applied'
  reason: string
  specPath?: string
  specLine?: number
  testTitle?: string
  autoApplicable: boolean
  createdAt: string
}

export interface StlcSharedState {
  runId: string
  requirementDocId?: string
  requirementText: string
  ambiguityFlags: AmbiguityFlag[]
  testabilityScore: number
  acceptanceCriteria: AcceptanceCriterion[]
  testScope: TestScope
  testCases: DesignedTestCase[]
  codebaseInsights?: CodebaseInsights
  appInsights?: AppScanResult
  executionResults: ExecutionResult[]
  defects: DefectRecord[]
  humanGates: HumanGate[]
  qualityGate: QualityGate
  auditTrail: AuditEntry[]
  ragMatches?: Array<{ patternId: string; score: number; symptom: string }>
  healingProposals?: HealingProposal[]
  flakyTests?: FlakyTestSummary[]
  codegen?: GeneratorOptions
  codegenArtifacts?: {
    pomPath: string
    fixturePath: string
    specPath: string
    totalCases: number
    pattern: string
  }
  currentPhase: StlcPhase
}

export interface OrchestratorOptions {
  requirementText?: string
  requirementFile?: string
  codegen: GeneratorOptions
  phases?: StlcPhase[]
  skipHumanGates?: boolean
  humanConfidenceThreshold?: number
  runTests?: boolean
  enableLlm?: boolean
  enableRag?: boolean
  enableSelfHealing?: boolean
  outputDir: string
}

export interface AgentResult {
  nextPhase: StlcPhase
  state: StlcSharedState
}

export interface StlcAgent {
  readonly name: string
  readonly phase: StlcPhase
  run(state: StlcSharedState, options: OrchestratorOptions): Promise<AgentResult>
}
