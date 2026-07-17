import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { analyzeTestImpact, buildPageDomainMap, listAllDomains } from './test-impact-analysis'

function makeFixtureRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-impact-'))
  const automationRoot = path.join(root, 'automation')

  fs.mkdirSync(path.join(automationRoot, 'domains', 'inventory'), { recursive: true })
  fs.mkdirSync(path.join(automationRoot, 'domains', 'auth'), { recursive: true })
  fs.mkdirSync(path.join(automationRoot, 'pages'), { recursive: true })
  fs.mkdirSync(path.join(automationRoot, 'suites', 'inventory'), { recursive: true })
  fs.mkdirSync(path.join(automationRoot, 'core', 'api'), { recursive: true })

  fs.writeFileSync(
    path.join(automationRoot, 'domains', 'inventory', 'inventory.fixture.ts'),
    `import { InventoryPage } from '@pages/inventory-page'\nexport const test = {}\n`,
  )
  fs.writeFileSync(
    path.join(automationRoot, 'domains', 'auth', 'auth.fixture.ts'),
    `import { LoginPage } from '@pages/login-page'\nexport const test = {}\n`,
  )

  return root
}

const repoRoot = makeFixtureRepo()

// --- buildPageDomainMap resolves fixture imports correctly ---
const pageMap = buildPageDomainMap(path.join(repoRoot, 'automation'))
assert.deepEqual([...(pageMap.get('inventory-page.ts') ?? [])], ['inventory'])
assert.deepEqual([...(pageMap.get('login-page.ts') ?? [])], ['auth'])

// --- listAllDomains ---
assert.deepEqual(listAllDomains(path.join(repoRoot, 'automation')), ['auth', 'inventory'])

// --- domain dir change → only that domain, no full suite ---
{
  const result = analyzeTestImpact(['automation/domains/inventory/inventory.fixture.ts'], repoRoot)
  assert.deepEqual(result.affectedDomains, ['inventory'])
  assert.equal(result.runFullSuite, false)
}

// --- suite dir change → maps to domain ---
{
  const result = analyzeTestImpact(['automation/suites/inventory/inventory.ui.spec.ts'], repoRoot)
  assert.deepEqual(result.affectedDomains, ['inventory'])
  assert.equal(result.runFullSuite, false)
}

// --- linked page file change → resolves domain via fixture import ---
{
  const result = analyzeTestImpact(['automation/pages/login-page.ts'], repoRoot)
  assert.deepEqual(result.affectedDomains, ['auth'])
  assert.equal(result.runFullSuite, false)
}

// --- unlinked page file change → conservative full suite ---
{
  const result = analyzeTestImpact(['automation/pages/checkout-page.ts'], repoRoot)
  assert.equal(result.runFullSuite, true)
  assert.equal(result.affectedDomains.length, 0)
}

// --- shared infra change (core/) → full suite ---
{
  const result = analyzeTestImpact(['automation/core/api/client.ts'], repoRoot)
  assert.equal(result.runFullSuite, true)
  assert.ok(result.reasons.some((r) => r.includes('shared infrastructure')))
}

// --- framework script change (stlc-orchestrator itself) → full suite ---
{
  const result = analyzeTestImpact(['automation/scripts/stlc-orchestrator/orchestrator.ts'], repoRoot)
  assert.equal(result.runFullSuite, true)
}

// --- requirement doc change → maps to domain ---
{
  const result = analyzeTestImpact(['automation/requirements/example.md'], repoRoot)
  assert.deepEqual(result.affectedDomains, ['example'])
  assert.equal(result.runFullSuite, false)
}

// --- unrelated top-level file → no impact at all ---
{
  const result = analyzeTestImpact(['README.md', 'automation/reports/html/index.html'], repoRoot)
  assert.deepEqual(result.affectedDomains, [])
  assert.equal(result.runFullSuite, false)
  assert.deepEqual(result.unmatchedFiles, [])
}

// --- multiple files across domains, no infra change → both domains, no full suite ---
{
  const result = analyzeTestImpact(
    ['automation/domains/inventory/inventory.fixture.ts', 'automation/domains/auth/auth.fixture.ts'],
    repoRoot,
  )
  assert.deepEqual(result.affectedDomains, ['auth', 'inventory'])
  assert.equal(result.runFullSuite, false)
}

fs.rmSync(repoRoot, { recursive: true, force: true })

console.log('test-impact-analysis.test.ts: all assertions passed')
