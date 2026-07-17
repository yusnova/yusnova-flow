import { ExplorePhase } from './types'

export const EXPLORE_PHASE_LABELS: Record<Exclude<ExplorePhase, 'done'>, string> = {
  setup: 'Setup — validate target & budget',
  crawl: 'Crawl — breadth-first bug hunt',
  triage: 'Triage — score anomalies → defects',
  review: 'Review — human gate for critical findings',
  reporting: 'Reporting — write exploration report',
  rag: 'RAG — ingest patterns into knowledge base',
}
