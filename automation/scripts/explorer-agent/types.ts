export type AnomalySeverity = 'critical' | 'major' | 'minor'

export type AnomalyType =
  | 'console_error'
  | 'page_error'
  | 'network_error'
  | 'broken_image'
  | 'error_text_on_page'
  | 'navigation_failure'

export interface Anomaly {
  id: string
  type: AnomalyType
  severity: AnomalySeverity
  pageUrl: string
  description: string
  evidence: string
  actionTrail: string[]
  screenshotPath?: string
  timestamp: string
}

export interface ExplorationOptions {
  url: string
  headless: boolean
  maxPages: number
  maxActionsPerPage: number
  sameOriginOnly: boolean
  outputDir: string
  /** When set, writes under outputDir/{runId} instead of generating a new id. */
  runId?: string
  storageState?: string
  /** Skip writing exploration-report.md (orchestrator reporting phase owns it). */
  skipMarkdownReport?: boolean
}

export interface ExplorationReport {
  runId: string
  startUrl: string
  pagesVisited: string[]
  actionsPerformed: number
  anomalies: Anomaly[]
  outputDir: string
  reportPath: string
  jsonPath: string
  screenshotsDir: string
}

/** Explore mini-orchestrator phases — mirrors STLC’s phase-runner pattern. */
export type ExplorePhase =
  | 'setup'
  | 'crawl'
  | 'triage'
  | 'review'
  | 'reporting'
  | 'rag'
  | 'done'

export interface ExploreAuditEntry {
  phase: ExplorePhase
  agent: string
  action: string
  reason: string
  confidence: number
  timestamp: string
  inputs?: Record<string, unknown>
}

export interface ExploreHumanGate {
  phase: ExplorePhase
  status: 'pending' | 'approved' | 'skipped'
  reason: string
  requiredFor: string[]
}

export interface ExploreQualityGate {
  decision: 'pass' | 'fail' | 'pending'
  blockingReasons: string[]
  criticalCount: number
  majorCount: number
  minorCount: number
  recommendation: string
  confidence: number
}

export interface ExploreSharedState {
  runId: string
  url: string
  domain: string
  pagesVisited: string[]
  actionsPerformed: number
  anomalies: Anomaly[]
  defects: Array<{
    id: string
    title: string
    severity: AnomalySeverity
    triageStatus: 'open' | 'noise' | 'confirmed'
    rootCauseHypothesis: string
    anomalyId: string
  }>
  humanGates: ExploreHumanGate[]
  qualityGate: ExploreQualityGate
  auditTrail: ExploreAuditEntry[]
  ragIngestedIds: string[]
  reportPath?: string
  jsonPath?: string
  screenshotsDir?: string
  currentPhase: ExplorePhase
}

export interface ExploreOrchestratorOptions {
  url: string
  domain: string
  headless: boolean
  maxPages: number
  maxActionsPerPage: number
  sameOriginOnly: boolean
  outputDir: string
  storageState?: string
  ingestRag: boolean
  skipHumanGates: boolean
  phases?: ExplorePhase[]
}
