import { StlcPhase } from './types'

export const PHASE_LABELS: Record<Exclude<StlcPhase, 'done'>, string> = {
  requirements: 'Analysing requirements…',
  planning: 'Building risk-based test strategy…',
  design: 'Designing test cases…',
  review_design: 'Reviewing test design (coverage & duplicates)…',
  codegen: 'Generating POM, fixture, and spec…',
  review_code: 'Validating generated code conventions…',
  execution: 'Executing Playwright tests…',
  triage: 'Triaging failures & updating RAG…',
  reporting: 'Computing quality gate recommendation…',
}

export function countPhases(order: StlcPhase[]): number {
  return order.filter((phase) => phase !== 'done').length
}
