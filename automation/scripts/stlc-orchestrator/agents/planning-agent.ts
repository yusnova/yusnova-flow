import * as path from 'node:path'
import { scanCodebase } from '../../shared/codebase-scanner'
import { resolveAppUnderTestRoot, scanAppUnderTest, type AppScanResult } from '../../shared/app-scanner'
import { appendAudit } from '../state/pipeline-state'
import { AgentResult, OrchestratorOptions, RiskItem, StlcSharedState, TestLevel } from '../types'

const CRITICAL_KEYWORDS = [
  'payment', 'auth', 'login', 'password', 'checkout', 'billing', 'security', 'booking', 'confirm',
]
const API_FRIENDLY_KEYWORDS = ['api', 'endpoint', 'response', 'status', 'json', 'token', 'header', 'postcode', 'lookup']
const HIGH_KEYWORDS = ['cart', 'inventory', 'search', 'booking', 'waste', 'skip', 'wizard', 'funnel']

function inferRisk(module: string): RiskItem['level'] {
  const lower = module.toLowerCase()
  if (CRITICAL_KEYWORDS.some((word) => lower.includes(word))) return 'critical'
  if (HIGH_KEYWORDS.some((word) => lower.includes(word))) return 'high'
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
  // Scan the monorepo parent (frontend/backend siblings), not just automation/.
  const automationRoot = path.resolve(__dirname, '..', '..', '..')
  const repoRoot = path.resolve(automationRoot, '..')
  const codebaseInsights = scanCodebase(repoRoot, domain)

  const appRoot = resolveAppRoot(options, automationRoot)
  if (appRoot && !options.codegen.appRoot) {
    options.codegen.appRoot = appRoot
  }
  const appInsights: AppScanResult | undefined = appRoot ? scanAppUnderTest(appRoot) : undefined

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

  // Every discovered API route is an integration risk that should be covered at
  // the API level (contract + negative/validation), independent of the UI.
  if (appInsights) {
    for (const route of appInsights.apiRoutes) {
      const requiredCount = route.fields.filter((f) => f.required).length
      const has5xx = route.errorStatuses.some((s) => s >= 500)
      riskMatrix.push({
        module: `${route.method} ${route.routePath}`,
        level: has5xx ? 'high' : requiredCount > 0 ? 'medium' : 'low',
        reason: `[app/api] ${route.method} ${route.routePath} — ${requiredCount} required field(s), statuses ${[route.successStatus, ...route.errorStatuses].join('/')}`,
        recommendedLevel: 'api',
      })
    }

    if (appInsights.selectors.some((s) => /confirm|book|lookup|postcode/i.test(s.testId))) {
      riskMatrix.push({
        module: `${domain}-wizard`,
        level: 'high',
        reason: '[app/ui] Multi-step funnel controls detected (lookup/select/confirm) — UI + integration risk',
        recommendedLevel: 'ui',
      })
    }
  }

  const inScope = [
    `UI flows for ${options.codegen.url}`,
    `Domain: ${domain}`,
    `Page: ${page}`,
    ...codebaseInsights.scannedRoots.map((root) => `Code scan: ${root}/`),
    ...(appRoot ? [`App-under-test: ${appRoot}`] : []),
  ]
  const outOfScope = [
    'Visual pixel-perfect comparison',
    'Load/stress testing (unless explicitly stated in requirements)',
  ]

  const scanNote = codebaseInsights.scannedRoots.length > 0
    ? ` Scanned ${codebaseInsights.scannedRoots.join(', ')} — ${codebaseInsights.findings.length} finding(s), ${codebaseInsights.selectors.length} selector hint(s).`
    : ''
  const appNote = appInsights?.detected
    ? ` App-under-test (${appInsights.framework}): ${appInsights.apiRoutes.length} API route(s), ${appInsights.selectors.length} selector(s).`
    : appRoot
      ? ' App-under-test root provided but no routes/selectors detected.'
      : ' No app-under-test root detected (pass --app-root or set STLC_APP_ROOT).'

  const next = appendAudit(
    {
      ...state,
      codebaseInsights,
      ...(appInsights ? { appInsights } : {}),
      testScope: { inScope, outOfScope, riskMatrix },
      currentPhase: 'design',
    },
    {
      phase: 'planning',
      agent: 'planning-agent',
      action: 'built_test_strategy',
      reason: `Applied risk-based scope with codebase discovery.${scanNote}${appNote}`,
      confidence: codebaseInsights.findings.length > 0 || appInsights?.detected ? 0.88 : 0.82,
      inputs: {
        scannedRoots: codebaseInsights.scannedRoots,
        findingCount: codebaseInsights.findings.length,
        apiEndpoints: codebaseInsights.apiEndpoints.slice(0, 10),
        appRoot: appRoot ?? null,
        appApiRoutes: appInsights?.apiRoutes.map((r) => `${r.method} ${r.routePath}`) ?? [],
      },
    },
  )

  return { nextPhase: 'design', state: next }
}

/** Resolve the application-under-test source root from options / env / nearby trees. */
function resolveAppRoot(options: OrchestratorOptions, automationRoot: string): string | undefined {
  return resolveAppUnderTestRoot({
    explicit: options.codegen.appRoot,
    domain: options.codegen.domain,
    searchFrom: [
      automationRoot,
      path.resolve(automationRoot, '..'),
      path.resolve(automationRoot, '../..'),
      process.cwd(),
    ],
  })
}
