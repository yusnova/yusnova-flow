import * as path from 'node:path'
import { scanCodebase } from '../../shared/codebase-scanner'
import { appendAudit } from '../state/pipeline-state'
import { AgentResult, OrchestratorOptions, RiskItem, StlcSharedState, TestLevel } from '../types'

const CRITICAL_KEYWORDS = ['payment', 'auth', 'login', 'password', 'checkout', 'billing', 'security']
const API_FRIENDLY_KEYWORDS = ['api', 'endpoint', 'response', 'status', 'json', 'token', 'header']

function inferRisk(module: string): RiskItem['level'] {
  const lower = module.toLowerCase()
  if (CRITICAL_KEYWORDS.some((word) => lower.includes(word))) return 'critical'
  if (lower.includes('cart') || lower.includes('inventory') || lower.includes('search')) return 'high'
  return 'medium'
}

function recommendLevel(module: string, requirementText: string): TestLevel {
  const lower = `${module} ${requirementText}`.toLowerCase()
  if (API_FRIENDLY_KEYWORDS.some((word) => lower.includes(word))) return 'api'
  if (CRITICAL_KEYWORDS.some((word) => lower.includes(word))) return 'api'
  return 'ui'
}

function mapFindingSeverity(level: string): RiskItem['level'] {
  if (level === 'critical') return 'critical'
  if (level === 'high') return 'high'
  if (level === 'medium') return 'medium'
  return 'low'
}

export async function runPlanningAgent(
  state: StlcSharedState,
  options: OrchestratorOptions,
): Promise<AgentResult> {
  const domain = options.codegen.domain
  const page = options.codegen.page
  const repoRoot = path.resolve(__dirname, '..', '..', '..')
  const codebaseInsights = scanCodebase(repoRoot, domain)

  const modules = [domain, page.replace(/Page$/, '')]
  const riskMatrix: RiskItem[] = modules.map((module) => {
    const level = inferRisk(module)
    const recommendedLevel = recommendLevel(module, state.requirementText)
    return {
      module,
      level,
      reason: `${level} risk module based on keyword heuristics and domain context`,
      recommendedLevel,
    }
  })

  for (const finding of codebaseInsights.findings) {
    if (finding.category === 'workflow' || finding.category === 'integration' || finding.category === 'unstable') {
      riskMatrix.push({
        module: path.basename(finding.filePath),
        level: mapFindingSeverity(finding.severity),
        reason: `[${finding.source}/${finding.category}] ${finding.summary}`,
        recommendedLevel: finding.suggestedLevel === 'api' ? 'api' : finding.suggestedLevel === 'e2e' ? 'e2e' : 'ui',
      })
    }
  }

  const inScope = [
    `UI flows for ${options.codegen.url}`,
    `Domain: ${domain}`,
    `Page: ${page}`,
    ...codebaseInsights.scannedRoots.map((root) => `Code scan: ${root}/`),
  ]
  const outOfScope = [
    'Visual pixel-perfect comparison',
    'Load/stress testing (unless explicitly stated in requirements)',
  ]

  const scanNote = codebaseInsights.scannedRoots.length > 0
    ? ` Scanned ${codebaseInsights.scannedRoots.join(', ')} — ${codebaseInsights.findings.length} finding(s), ${codebaseInsights.selectors.length} selector hint(s).`
    : ''

  const next = appendAudit(
    {
      ...state,
      codebaseInsights,
      testScope: { inScope, outOfScope, riskMatrix },
      currentPhase: 'design',
    },
    {
      phase: 'planning',
      agent: 'planning-agent',
      action: 'built_test_strategy',
      reason: `Applied risk-based scope with codebase discovery.${scanNote}`,
      confidence: codebaseInsights.findings.length > 0 ? 0.88 : 0.82,
      inputs: {
        scannedRoots: codebaseInsights.scannedRoots,
        findingCount: codebaseInsights.findings.length,
        apiEndpoints: codebaseInsights.apiEndpoints.slice(0, 10),
      },
    },
  )

  return { nextPhase: 'design', state: next }
}
