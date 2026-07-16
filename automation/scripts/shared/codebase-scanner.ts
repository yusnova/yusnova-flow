import * as fs from 'node:fs'
import * as path from 'node:path'

export type CodebaseSource = 'frontend' | 'backend' | 'automation'
export type FindingCategory = 'workflow' | 'risk' | 'unstable' | 'integration' | 'selector' | 'gap'

export interface CodebaseFinding {
  id: string
  category: FindingCategory
  source: CodebaseSource
  filePath: string
  summary: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  evidence: string
  suggestedTestTitle: string
  suggestedLevel: 'ui' | 'api' | 'e2e'
}

export interface CodebaseSelectorHint {
  selector: string
  strategy: 'data-test' | 'data-testid' | 'id' | 'css'
  source: CodebaseSource
  filePath: string
  context: string
}

export interface CodebaseInsights {
  scannedRoots: string[]
  findings: CodebaseFinding[]
  selectors: CodebaseSelectorHint[]
  apiEndpoints: string[]
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'generated', 'tmp', 'reports'])

const WORKFLOW_KEYWORDS = [
  { pattern: /login|sign[\s-]?in|auth/i, label: 'authentication workflow' },
  { pattern: /checkout|payment|billing|cart/i, label: 'checkout / cart workflow' },
  { pattern: /inventory|catalog|product/i, label: 'product catalog workflow' },
  { pattern: /register|sign[\s-]?up/i, label: 'registration workflow' },
]

const UNSTABLE_MARKERS = [/TODO/i, /FIXME/i, /HACK/i, /experimental/i, /unstable/i, /@deprecated/i]

let findingCounter = 0

function nextFindingId(prefix: string): string {
  findingCounter += 1
  return `${prefix}-${String(findingCounter).padStart(3, '0')}`
}

function relPath(root: string, abs: string): string {
  return path.relative(root, abs).replace(/\\/g, '/')
}

function walkFiles(dir: string, root: string, maxFiles = 400): string[] {
  if (!fs.existsSync(dir)) return []
  const results: string[] = []
  const stack = [dir]

  while (stack.length > 0 && results.length < maxFiles) {
    const current = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(abs)
        continue
      }
      const ext = path.extname(entry.name)
      if (SOURCE_EXTENSIONS.has(ext)) results.push(abs)
    }
  }

  return results.map((abs) => relPath(root, abs))
}

function readFileSafe(root: string, rel: string): string {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf-8')
  } catch {
    return ''
  }
}

function detectSource(relPathStr: string, roots: Record<CodebaseSource, string | undefined>): CodebaseSource {
  if (roots.frontend && relPathStr.startsWith('frontend/')) return 'frontend'
  if (roots.backend && relPathStr.startsWith('backend/')) return 'backend'
  return 'automation'
}

function extractSelectors(content: string, filePath: string, source: CodebaseSource): CodebaseSelectorHint[] {
  const hints: CodebaseSelectorHint[] = []

  for (const match of content.matchAll(/data-test="([^"]+)"/g)) {
    hints.push({
      selector: `[data-test="${match[1]}"]`,
      strategy: 'data-test',
      source,
      filePath,
      context: match[1]!,
    })
  }

  for (const match of content.matchAll(/data-testid="([^"]+)"/g)) {
    hints.push({
      selector: `[data-testid="${match[1]}"]`,
      strategy: 'data-testid',
      source,
      filePath,
      context: match[1]!,
    })
  }

  for (const match of content.matchAll(/\bid="([^"]+)"/g)) {
    const id = match[1]!
    if (id.length < 3 || id.includes('{{')) continue
    hints.push({
      selector: `#${id}`,
      strategy: 'id',
      source,
      filePath,
      context: id,
    })
  }

  return hints
}

function extractApiEndpoints(content: string): string[] {
  const endpoints = new Set<string>()
  const patterns = [
    /['"`](\/api\/[^'"`?\s]+)['"`]/g,
    /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi,
    /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi,
    /fetch\(\s*['"`]([^'"`]+)['"`]/g,
  ]

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const endpoint = match[2] ?? match[1]
      if (endpoint && (endpoint.startsWith('/') || endpoint.startsWith('http'))) {
        endpoints.add(endpoint.replace(/\$\{[^}]+\}/g, '{param}'))
      }
    }
  }

  return [...endpoints]
}

function severityForWorkflow(label: string): CodebaseFinding['severity'] {
  if (/auth|payment|checkout/i.test(label)) return 'critical'
  if (/cart|inventory|register/i.test(label)) return 'high'
  return 'medium'
}

export function scanCodebase(repoRoot: string, domain?: string): CodebaseInsights {
  findingCounter = 0
  const automationRoot = fs.existsSync(path.join(repoRoot, 'automation'))
    ? path.join(repoRoot, 'automation')
    : repoRoot

  const candidateRoots: Array<{ key: CodebaseSource; abs: string | undefined; rel: string }> = [
    { key: 'frontend', abs: findRoot(repoRoot, 'frontend'), rel: 'frontend' },
    { key: 'backend', abs: findRoot(repoRoot, 'backend'), rel: 'backend' },
    { key: 'automation', abs: automationRoot, rel: 'automation' },
  ]

  const roots: Record<CodebaseSource, string | undefined> = {
    frontend: candidateRoots.find((entry) => entry.key === 'frontend')?.abs,
    backend: candidateRoots.find((entry) => entry.key === 'backend')?.abs,
    automation: automationRoot,
  }

  const scannedRoots = candidateRoots.filter((entry) => entry.abs).map((entry) => entry.rel)
  const findings: CodebaseFinding[] = []
  const selectors: CodebaseSelectorHint[] = []
  const apiEndpoints = new Set<string>()
  const domainLower = domain?.toLowerCase() ?? ''

  for (const { key, abs } of candidateRoots) {
    if (!abs) continue
    const files = walkFiles(abs, repoRoot)

    for (const filePath of files) {
      // Applies to every source, including the automation fallback: without this,
      // "automation" (the STLC tooling's own code) bypassed domain relevance and
      // got scanned as if it were the application under test, producing findings
      // like "inspect auto-healer.ts" that have nothing to do with the SUT.
      if (domainLower && !filePath.toLowerCase().includes(domainLower)) {
        const contentPeek = readFileSafe(repoRoot, filePath).toLowerCase()
        if (!contentPeek.includes(domainLower)) continue
      }

      const content = readFileSafe(repoRoot, filePath)
      if (!content) continue

      const source = detectSource(filePath, roots)
      selectors.push(...extractSelectors(content, filePath, source))
      for (const endpoint of extractApiEndpoints(content)) apiEndpoints.add(endpoint)

      for (const { pattern, label } of WORKFLOW_KEYWORDS) {
        if (pattern.test(filePath) || pattern.test(content.slice(0, 2000))) {
          findings.push({
            id: nextFindingId('WF'),
            category: 'workflow',
            source,
            filePath,
            summary: `Critical business workflow detected: ${label}`,
            severity: severityForWorkflow(label),
            evidence: `Matched in ${filePath}`,
            suggestedTestTitle: `Verify ${label} for ${domain || 'feature'} end-to-end`,
            suggestedLevel: /api|router|controller|route/i.test(filePath) ? 'api' : 'ui',
          })
        }
      }

      for (const marker of UNSTABLE_MARKERS) {
        if (marker.test(content)) {
          findings.push({
            id: nextFindingId('UN'),
            category: 'unstable',
            source,
            filePath,
            summary: 'Potentially unstable component or unfinished implementation',
            severity: 'medium',
            evidence: `Marker ${marker.source} in ${filePath}`,
            suggestedTestTitle: domain
              ? `Verify ${domain} page handles unexpected input without breaking`
              : 'Verify page handles unexpected input without breaking',
            suggestedLevel: 'ui',
          })
          break
        }
      }

      if (source === 'backend' && /(router|controller|handler|endpoint)/i.test(filePath)) {
        findings.push({
          id: nextFindingId('INT'),
          category: 'integration',
          source,
          filePath,
          summary: 'Backend integration point (API route or handler)',
          severity: 'high',
          evidence: filePath,
          suggestedTestTitle: `Verify API contract for ${domain || 'feature'} endpoints`,
          suggestedLevel: 'api',
        })
      }

      if (source === 'frontend' && /(fetch|axios|useQuery|useMutation|api\.)/i.test(content)) {
        findings.push({
          id: nextFindingId('INT'),
          category: 'integration',
          source,
          filePath,
          summary: 'Frontend-to-backend integration call',
          severity: 'high',
          evidence: filePath,
          suggestedTestTitle: `Verify UI handles backend integration for ${domain || 'feature'}`,
          suggestedLevel: 'e2e',
        })
      }
    }
  }

  const dedupedFindings = dedupeFindings(findings)
  const dedupedSelectors = dedupeSelectors(selectors)

  if (dedupedSelectors.length > 0) {
    dedupedFindings.push({
      id: nextFindingId('SEL'),
      category: 'selector',
      source: 'frontend',
      filePath: dedupedSelectors[0]!.filePath,
      summary: `${dedupedSelectors.length} selector hint(s) discovered in application source`,
      severity: 'medium',
      evidence: dedupedSelectors.slice(0, 3).map((hint) => hint.selector).join(', '),
      suggestedTestTitle: 'Verify UI controls referenced in application source are testable',
      suggestedLevel: 'ui',
    })
  }

  return {
    scannedRoots,
    findings: dedupedFindings,
    selectors: dedupedSelectors,
    apiEndpoints: [...apiEndpoints].slice(0, 50),
  }
}

function findRoot(repoRoot: string, name: string): string | undefined {
  const direct = path.join(repoRoot, name)
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct
  const nested = path.join(repoRoot, 'automation', name)
  if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) return nested
  return undefined
}

function dedupeFindings(findings: CodebaseFinding[]): CodebaseFinding[] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = `${finding.category}:${finding.filePath}:${finding.summary}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupeSelectors(selectors: CodebaseSelectorHint[]): CodebaseSelectorHint[] {
  const seen = new Set<string>()
  return selectors.filter((hint) => {
    if (seen.has(hint.selector)) return false
    seen.add(hint.selector)
    return true
  })
}

export function findingsMissingFromRequirements(
  findings: CodebaseFinding[],
  requirementText: string,
  existingCaseTitles: string[],
): CodebaseFinding[] {
  const reqLower = requirementText.toLowerCase()
  const titlesLower = existingCaseTitles.map((title) => title.toLowerCase())

  return findings.filter((finding) => {
    if (finding.severity === 'low') return false
    const tokens = finding.suggestedTestTitle.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    const coveredByRequirement = tokens.some((token) => reqLower.includes(token))
    const coveredByCase = titlesLower.some(
      (title) => tokens.filter((token) => title.includes(token)).length >= 2,
    )
    return !coveredByRequirement && !coveredByCase
  })
}
