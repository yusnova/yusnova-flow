import assert from 'node:assert/strict'
import {
  inferCriteriaFromUrl,
  isDemoRequirementText,
  isFindingRelevantToDomain,
  shouldAutoSynthesizeRequirements,
  shouldEnrichRequirements,
} from './requirement-synthesizer'
import { CodebaseFinding } from '../shared/codebase-scanner'

assert.equal(shouldAutoSynthesizeRequirements('', undefined), true)
assert.equal(shouldAutoSynthesizeRequirements('AC: User can view the product list', undefined), false)
assert.equal(
  isDemoRequirementText('AC: User can view the product list\nAC: User must be able to add items to cart\nAC: User can sort products by price'),
  true,
)

assert.equal(
  shouldEnrichRequirements(
    'AC1: User can look up a UK postcode. AC2: User can select waste. AC3: User can select skip. AC4: User can confirm booking.',
    undefined,
  ),
  false,
)
assert.equal(shouldEnrichRequirements('AC: User can open the page', undefined), true)

const blogCriteria = inferCriteriaFromUrl('https://ozturksoft.net/blog', 'blog')
assert.ok(blogCriteria.some((line) => /blog listing/i.test(line)))
assert.ok(!blogCriteria.some((line) => /product list/i.test(line)))

const irrelevantProductFinding: CodebaseFinding = {
  id: 'WF-1',
  category: 'workflow',
  source: 'automation',
  filePath: 'automation/suites/products/products.ui.spec.ts',
  summary: 'Critical business workflow detected: product catalog workflow',
  severity: 'high',
  evidence: 'matched',
  suggestedTestTitle: 'Verify product catalog workflow for blog end-to-end',
  suggestedLevel: 'ui',
}

assert.equal(
  isFindingRelevantToDomain(irrelevantProductFinding, 'blog', 'user can view the blog listing page'),
  false,
)

console.log('requirement-synthesizer: all tests passed')
