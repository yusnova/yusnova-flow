import assert from 'node:assert/strict'
import { extractAcAssertionTarget, mergeDesignCasesIntoPlan, DesignedCaseMergeInput } from './design-case-merge'
import { ResolvedElement, TestPlan } from '../types'

// --- extractAcAssertionTarget ---
assert.deepEqual(
  extractAcAssertionTarget(['AC: Page shows the "The Internet" title']),
  { phrase: 'The Internet', kind: 'title' },
)
assert.deepEqual(
  extractAcAssertionTarget(['AC: Page shows the &quot;The Internet&quot; title']),
  { phrase: 'The Internet', kind: 'title' },
)
assert.deepEqual(
  extractAcAssertionTarget(['AC: Page displays the "Welcome back" banner']),
  { phrase: 'Welcome back', kind: 'text' },
)
assert.equal(extractAcAssertionTarget(['AC: User can open the page']), undefined)
assert.equal(extractAcAssertionTarget([]), undefined)

function resolvedEl(partial: Partial<ResolvedElement> & Pick<ResolvedElement, 'kind' | 'tagName' | 'propertyName'>): ResolvedElement {
  return {
    classes: [],
    parentPath: '',
    ancestorSelectors: [],
    isRequired: false,
    isDisabled: false,
    index: 0,
    label: partial.propertyName,
    locator: { selector: `#${partial.propertyName}`, strategy: 'id', confidence: 'high' },
    uiAction: 'clickElement',
    ...partial,
  }
}

function basePlan(elements: ResolvedElement[]): TestPlan {
  return {
    pageName: 'DynamicContentPage',
    domain: 'example',
    url: 'https://demo.example.com/dynamic-content',
    pattern: 'interactive',
    elements,
    testGroups: [],
  }
}

function designedCase(partial: Partial<DesignedCaseMergeInput>): DesignedCaseMergeInput {
  return {
    id: 'TC-001',
    title: 'user can open the page',
    type: 'happy-path',
    level: 'ui',
    acceptanceCriteriaIds: ['AC-001'],
    acTexts: ['AC: User can open the page'],
    steps: [],
    ...partial,
  }
}

// --- interactive pattern with no AC phrase: click + content-change assertion ---
{
  const clickHereLink = resolvedEl({
    kind: 'link',
    tagName: 'a',
    propertyName: 'clickHereLink',
    label: 'click here',
    href: '/dynamic-content',
  })
  const plan = basePlan([clickHereLink])
  const result = mergeDesignCasesIntoPlan(plan, [designedCase({})])

  assert.equal(result.addedDesignedIds.length, 1)
  const addedCase = result.plan.testGroups.flatMap((g) => g.cases)[0]!
  const code = addedCase.steps.flatMap((s) => s.code).join('\n')
  assert.match(code, /captureText/)
  assert.match(code, /expectContentChanged/)
  assert.doesNotMatch(code, /toHaveURL\(\/\.\+\//)
}

// --- interactive pattern with a checkable AC phrase: content-text assertion, no fabricated form ---
{
  const clickHereLink = resolvedEl({
    kind: 'link',
    tagName: 'a',
    propertyName: 'clickHereLink',
    label: 'click here',
    href: '/dynamic-content',
  })
  const plan = basePlan([clickHereLink])
  const designed = designedCase({
    id: 'TC-002',
    title: 'Page shows the "Example App" title',
    acTexts: ['AC: Page shows the "Example App" title'],
  })

  const result = mergeDesignCasesIntoPlan(plan, [designed])
  assert.equal(result.addedDesignedIds.length, 1)
  const addedCase = result.plan.testGroups.flatMap((g) => g.cases)[0]!
  const code = addedCase.steps.flatMap((s) => s.code).join('\n')
  assert.match(code, /toHaveTitle\(new RegExp\("Example App"\)\)/)
  assert.doesNotMatch(code, /form submission/i)
}

// --- AC phrase describing visible body text (not "title") uses toContainText ---
{
  const plan = basePlan([])
  const designed = designedCase({
    id: 'TC-003',
    title: 'Page displays the "Welcome back" banner',
    acTexts: ['AC: Page displays the "Welcome back" banner'],
  })

  const result = mergeDesignCasesIntoPlan(plan, [designed])
  const addedCase = result.plan.testGroups.flatMap((g) => g.cases)[0]!
  const code = addedCase.steps.flatMap((s) => s.code).join('\n')
  assert.match(code, /toContainText\("Welcome back"\)/)
}

console.log('design-case-merge: all tests passed')
