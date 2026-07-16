import assert from 'node:assert/strict'
import {
  extractManualSpecBlocks,
  mergeSpecPreservingManual,
  STLC_GENERATED_MARKER,
  STLC_MANUAL_MARKER,
} from './spec-merge'

const existing = `
import { test } from '@playwright/test'

test.describe('Generated', () => {
  // ${STLC_GENERATED_MARKER}
  test('old generated case', async () => {})
})

test('my manual case', async () => {
  // custom logic
})

test.describe('Mixed', () => {
  // ${STLC_GENERATED_MARKER}
  test('old generated in group', async () => {})

  // ${STLC_MANUAL_MARKER}
  test('kept manual in group', async () => {})
})
`

const generated = `
import { test } from '@playwright/test'

test.describe('Generated', () => {
  // ${STLC_GENERATED_MARKER}
  test('new generated case', async () => {})
})
`

const manualBlocks = extractManualSpecBlocks(existing)
assert.equal(manualBlocks.length, 2)
assert.match(manualBlocks[0]!, /my manual case/)
assert.match(manualBlocks[1]!, /kept manual in group/)
assert.doesNotMatch(manualBlocks.join('\n'), /old generated/)

const merged = mergeSpecPreservingManual(existing, generated)
assert.match(merged, /new generated case/)
assert.doesNotMatch(merged, /old generated case/)
assert.match(merged, /my manual case/)
assert.match(merged, /kept manual in group/)
assert.match(merged, /\[Manual\] Preserved tests/)

console.log('spec-merge: all tests passed')
