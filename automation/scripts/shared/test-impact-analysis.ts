import * as fs from 'node:fs'
import * as path from 'node:path'

export interface ImpactResult {
  affectedDomains: string[]
  runFullSuite: boolean
  reasons: string[]
  unmatchedFiles: string[]
}

/**
 * Files matching any of these patterns affect every domain (shared
 * infrastructure, framework code, or global config) — treat as "run
 * everything" rather than trying to guess a narrower blast radius.
 */
const SHARED_INFRA_PATTERNS: RegExp[] = [
  /^automation\/core\//,
  /^automation\/bootstrap\//,
  /^automation\/pages\/base-page\.ts$/,
  /^automation\/playwright\.config\.ts$/,
  /^automation\/tsconfig\.json$/,
  /^automation\/package(-lock)?\.json$/,
  /^automation\/\.eslintrc/,
  /^automation\/scripts\/codegen-agent\//,
  /^automation\/scripts\/stlc-orchestrator\//,
  /^automation\/scripts\/shared\//,
  /^automation\/scripts\/validator\//,
]

const DOMAIN_DIR_PATTERN = /^automation\/domains\/([^/]+)\//
const SUITE_DIR_PATTERN = /^automation\/suites\/([^/]+)\//
const REQUIREMENT_FILE_PATTERN = /^automation\/requirements\/([^/.]+)\.md$/
const PAGE_FILE_PATTERN = /^automation\/pages\/([a-zA-Z0-9-]+-page)\.ts$/
const IGNORED_PATTERNS = [
  /^automation\/tmp\//,
  /^automation\/reports\//,
  /^automation\/node_modules\//,
  /^automation\/\.env/,
  /\.md$/,
]

function normalizeRelPath(repoRoot: string, file: string): string {
  const abs = path.isAbsolute(file) ? file : path.join(repoRoot, file)
  return path.relative(repoRoot, abs).replace(/\\/g, '/')
}

/**
 * Maps page file basenames (e.g. "inventory-page.ts") to the domain(s) whose
 * fixture imports them, by scanning each domain's fixture.ts file under
 * domains/. This mirrors the real coupling in the codebase instead of
 * guessing from file names.
 */
export function buildPageDomainMap(automationRoot: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  const domainsDir = path.join(automationRoot, 'domains')
  if (!fs.existsSync(domainsDir)) return map

  for (const entry of fs.readdirSync(domainsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const domainDir = path.join(domainsDir, entry.name)
    for (const file of fs.readdirSync(domainDir)) {
      if (!file.endsWith('.fixture.ts')) continue
      const content = fs.readFileSync(path.join(domainDir, file), 'utf-8')
      const importMatches = content.matchAll(
        /from\s+['"](?:@pages\/|\.\.\/\.\.\/pages\/|\.\.\/pages\/)([a-zA-Z0-9-]+)['"]/g,
      )
      for (const match of importMatches) {
        const pageFile = `${match[1]}.ts`
        const domains = map.get(pageFile) ?? new Set<string>()
        domains.add(entry.name)
        map.set(pageFile, domains)
      }
    }
  }

  return map
}

export function listAllDomains(automationRoot: string): string[] {
  const domainsDir = path.join(automationRoot, 'domains')
  if (!fs.existsSync(domainsDir)) return []
  return fs
    .readdirSync(domainsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/**
 * Maps a list of changed file paths (repo-root-relative or absolute) to the
 * set of test domains impacted by the change. Conservative by design: any
 * file it can't confidently attribute to a domain (shared infra, unlinked
 * page files, etc.) flips `runFullSuite` rather than silently skipping tests.
 */
export function analyzeTestImpact(changedFiles: string[], repoRoot: string): ImpactResult {
  const automationRoot = path.join(repoRoot, 'automation')
  const pageDomainMap = buildPageDomainMap(automationRoot)

  const affected = new Set<string>()
  const reasons: string[] = []
  const unmatched: string[] = []
  let runFullSuite = false

  for (const raw of changedFiles) {
    const rel = normalizeRelPath(repoRoot, raw)
    if (!rel.startsWith('automation/')) continue

    const requirementMatch = rel.match(REQUIREMENT_FILE_PATTERN)
    if (requirementMatch) {
      affected.add(requirementMatch[1]!)
      reasons.push(`${rel} → domain "${requirementMatch[1]}" (requirement doc)`)
      continue
    }

    if (IGNORED_PATTERNS.some((pattern) => pattern.test(rel))) continue

    if (SHARED_INFRA_PATTERNS.some((pattern) => pattern.test(rel))) {
      runFullSuite = true
      reasons.push(`${rel} → shared infrastructure change, affects all domains`)
      continue
    }

    const domainMatch = rel.match(DOMAIN_DIR_PATTERN)
    if (domainMatch) {
      affected.add(domainMatch[1]!)
      reasons.push(`${rel} → domain "${domainMatch[1]}"`)
      continue
    }

    const suiteMatch = rel.match(SUITE_DIR_PATTERN)
    if (suiteMatch) {
      affected.add(suiteMatch[1]!)
      reasons.push(`${rel} → domain "${suiteMatch[1]}"`)
      continue
    }

    const pageMatch = rel.match(PAGE_FILE_PATTERN)
    if (pageMatch) {
      const pageFile = `${pageMatch[1]}.ts`
      const domains = pageDomainMap.get(pageFile)
      if (domains && domains.size > 0) {
        for (const domain of domains) {
          affected.add(domain)
          reasons.push(`${rel} → domain "${domain}" (via fixture import)`)
        }
      } else {
        runFullSuite = true
        reasons.push(`${rel} → page file not linked to any domain fixture, running full suite to be safe`)
      }
      continue
    }

    unmatched.push(rel)
  }

  return {
    affectedDomains: [...affected].sort(),
    runFullSuite,
    reasons,
    unmatchedFiles: unmatched,
  }
}
