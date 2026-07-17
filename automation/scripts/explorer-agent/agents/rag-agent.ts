import { DefectKnowledgeBase } from '../../stlc-orchestrator/rag/defect-knowledge'
import { DefectRecord } from '../../stlc-orchestrator/types'
import { appendExploreAudit, nextExplorePhase } from '../state'
import { ExploreAgentResult } from './setup-agent'
import { ExploreOrchestratorOptions, ExploreSharedState } from '../types'

export async function runRagAgent(
  state: ExploreSharedState,
  options: ExploreOrchestratorOptions,
): Promise<ExploreAgentResult> {
  let next = { ...state }

  if (!options.ingestRag) {
    next = appendExploreAudit(next, {
      phase: 'rag',
      agent: 'rag-agent',
      action: 'rag_skipped',
      reason: 'RAG ingest disabled (pass --ingest-rag to feed critical/major open defects into the knowledge base)',
      confidence: 1,
    })
    return { nextPhase: nextExplorePhase('rag', options.phases), state: next }
  }

  const candidates = state.defects.filter(
    (defect) =>
      defect.triageStatus === 'open' &&
      (defect.severity === 'critical' || defect.severity === 'major'),
  )

  if (candidates.length === 0) {
    next = appendExploreAudit(next, {
      phase: 'rag',
      agent: 'rag-agent',
      action: 'rag_nothing_to_ingest',
      reason: 'No open critical/major defects to ingest',
      confidence: 1,
    })
    return { nextPhase: nextExplorePhase('rag', options.phases), state: next }
  }

  const defects: DefectRecord[] = candidates.map((defect) => ({
    id: defect.id,
    title: defect.title,
    severity: defect.severity,
    dedupHash: defect.anomalyId,
    triageStatus: 'open',
    rootCauseHypothesis: defect.rootCauseHypothesis,
    linkedCaseIds: [],
    confidence: 0.6,
  }))

  const knowledgeBase = new DefectKnowledgeBase()
  const added = knowledgeBase.ingestFromDefects(defects, options.domain, state.runId)

  next = {
    ...next,
    ragIngestedIds: added.map((pattern) => pattern.id),
  }
  next = appendExploreAudit(next, {
    phase: 'rag',
    agent: 'rag-agent',
    action: 'ingested_defect_patterns',
    reason: `Ingested ${added.length} defect pattern(s) into RAG (module: ${options.domain})`,
    confidence: 0.8,
    inputs: { count: added.length, domain: options.domain },
  })

  return { nextPhase: nextExplorePhase('rag', options.phases), state: next }
}
