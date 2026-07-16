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
  storageState?: string
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
