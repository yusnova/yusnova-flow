import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { pruneAutomationTmp, pruneExplorationRuns, pruneStlcRuns } from './tmp-cleanup'

function touchDir(dir: string, mtimeMs: number): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'marker.txt'), 'x')
  fs.utimesSync(dir, mtimeMs / 1000, mtimeMs / 1000)
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-cleanup-test-'))
const stlcDir = path.join(root, 'tmp', 'stlc')
const explorationDir = path.join(stlcDir, 'exploration')

try {
  fs.mkdirSync(path.join(stlcDir, 'knowledge'), { recursive: true })

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  // STLC UUID runs — 3 total, keep 1
  touchDir(path.join(stlcDir, '11111111-1111-1111-1111-111111111111'), now - 3 * day)
  touchDir(path.join(stlcDir, '22222222-2222-2222-2222-222222222222'), now - 2 * day)
  touchDir(path.join(stlcDir, '33333333-3333-3333-3333-333333333333'), now - 1 * day)

  // Exploration runs — 3 total, keep 1
  touchDir(path.join(explorationDir, 'explore-1000'), now - 3 * day)
  touchDir(path.join(explorationDir, 'explore-2000'), now - 2 * day)
  touchDir(path.join(explorationDir, 'explore-3000'), now - 1 * day)

  // Should be ignored (not a run folder pattern)
  touchDir(path.join(explorationDir, 'not-a-run'), now - 5 * day)
  touchDir(path.join(stlcDir, 'exploration'), now - 5 * day)

  {
    const result = pruneStlcRuns({ stlcDir, maxRuns: 1, maxAgeDays: 0 })
    assert.equal(result.removed.length, 2, 'should prune 2 oldest STLC UUID runs')
    assert.equal(result.kept, 1)
    assert.equal(fs.existsSync(path.join(stlcDir, '33333333-3333-3333-3333-333333333333')), true)
    assert.equal(fs.existsSync(path.join(stlcDir, 'knowledge')), true)
  }

  {
    const result = pruneExplorationRuns({ stlcDir, maxRuns: 1, maxAgeDays: 0 })
    assert.equal(result.explorationRemoved.length, 2, 'should prune 2 oldest exploration runs')
    assert.equal(result.explorationKept, 1)
    assert.equal(fs.existsSync(path.join(explorationDir, 'explore-3000')), true)
    assert.equal(fs.existsSync(path.join(explorationDir, 'not-a-run')), true, 'non-run folders must be preserved')
  }

  {
    const result = pruneAutomationTmp(root, { stlcDir, maxRuns: 1, maxAgeDays: 0 })
    assert.equal(result.kept, 1)
    assert.equal(result.explorationKept, 1)
    assert.equal(fs.existsSync(path.join(stlcDir, 'exploration')), true, 'exploration parent dir must never be deleted')
  }

  console.log('tmp-cleanup.test.ts: all assertions passed')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
