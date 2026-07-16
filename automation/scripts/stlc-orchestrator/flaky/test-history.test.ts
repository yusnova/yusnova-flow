import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { computeFlakyScore, TestHistoryTracker, TestRunRecord } from './test-history'

function run(status: TestRunRecord['status'], runId = 'r'): TestRunRecord {
  return { runId, timestamp: new Date().toISOString(), status }
}

// --- computeFlakyScore: too few samples → 0 ---
assert.equal(computeFlakyScore([run('failed'), run('passed')]), 0)

// --- always passing → 0 (stable, not flaky) ---
assert.equal(computeFlakyScore([run('passed'), run('passed'), run('passed'), run('passed')]), 0)

// --- always failing → 0 (real regression, not flaky) ---
assert.equal(computeFlakyScore([run('failed'), run('failed'), run('failed'), run('failed')]), 0)

// --- perfectly alternating → high score ---
{
  const score = computeFlakyScore([run('passed'), run('failed'), run('passed'), run('failed'), run('passed')])
  assert.ok(score >= 0.9, `expected high flaky score for alternating pattern, got ${score}`)
}

// --- mostly passing with one blip → moderate score, not zero ---
{
  const score = computeFlakyScore([run('passed'), run('passed'), run('failed'), run('passed'), run('passed')])
  assert.ok(score > 0 && score < 0.6, `expected moderate flaky score, got ${score}`)
}

// --- TestHistoryTracker: records across multiple runs and persists ---
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-flaky-'))
  const tracker = new TestHistoryTracker(dir)

  tracker.record('inventory', 'run-1', [
    { caseId: 'AddToCart', status: 'passed', flakyScore: 0 },
    { caseId: 'SortByPrice', status: 'passed', flakyScore: 0 },
  ])
  tracker.record('inventory', 'run-2', [
    { caseId: 'AddToCart', status: 'failed', flakyScore: 0 },
    { caseId: 'SortByPrice', status: 'passed', flakyScore: 0 },
  ])
  const touched = tracker.record('inventory', 'run-3', [
    { caseId: 'AddToCart', status: 'passed', flakyScore: 0 },
    { caseId: 'SortByPrice', status: 'passed', flakyScore: 0 },
  ])

  const addToCart = touched.find((entry) => entry.caseId === 'AddToCart')!
  const sortByPrice = touched.find((entry) => entry.caseId === 'SortByPrice')!

  assert.ok(addToCart.flakyScore > 0, 'AddToCart alternated pass/fail/pass, should have a nonzero flaky score')
  assert.equal(sortByPrice.flakyScore, 0, 'SortByPrice always passed, should not be flaky')
  assert.equal(addToCart.sampleSize, 3)

  // Persistence: a fresh tracker instance pointed at the same dir sees the same data
  const reloaded = new TestHistoryTracker(dir)
  const summary = reloaded.summary('inventory')
  assert.equal(summary.length, 2)

  const flaky = reloaded.flakyTests('inventory', 0.1)
  assert.ok(flaky.some((entry) => entry.caseId === 'AddToCart'))
  assert.ok(!flaky.some((entry) => entry.caseId === 'SortByPrice'))

  assert.equal(reloaded.isKnownFlaky('inventory', 'SortByPrice'), false)

  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('test-history.test.ts: all assertions passed')
