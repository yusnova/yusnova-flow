import assert from 'node:assert/strict'
import { ElementInfo } from './types'
import {
  isDynamicId,
  isStableId,
  pickElementLocator,
  pickTestAttribute,
} from './locator-priority'

/** Neutral fixture values — not tied to any domain/page in the repo. */
const FIXTURE = {
  stableFormId: 'login-form',
  stablePanelId: 'settings-panel',
  dynamicTableId: 'table-6476547564475-45884-74893473',
  containerTestId: 'main-content-panel',
  listClass: 'item_list',
  listClassToken: 'item-list',
  wrapperClass: 'page_wrapper',
  semanticInputClass: 'input-large',
  genericInputClass: 'form-control',
  submitTestId: 'submit-btn',
  legacyTestAttr: 'legacy-submit',
  cyAttr: 'cy-submit',
  primaryActionCy: 'primary-action',
  accessibleActionLabel: 'Save changes',
  fieldName: 'username',
  fieldPlaceholder: 'Email address',
} as const

function ancestorWithTestId(testId: string): string {
  return `div[data-testid="${testId}"]`
}

function baseElement(overrides: Partial<ElementInfo> = {}): ElementInfo {
  return {
    kind: 'button',
    tagName: 'button',
    classes: [],
    parentPath: '',
    ancestorSelectors: [],
    isRequired: false,
    isDisabled: false,
    index: 0,
    ...overrides,
  }
}

function testDynamicIds(): void {
  assert.equal(isDynamicId(FIXTURE.dynamicTableId), true)
  assert.equal(isDynamicId('mui-42'), true)
  assert.equal(isDynamicId(':r1:'), true)
  assert.equal(isDynamicId('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), true)
  assert.equal(isStableId(FIXTURE.stableFormId), true)
  assert.equal(isStableId(FIXTURE.stablePanelId), true)
  assert.equal(isStableId(FIXTURE.dynamicTableId), false)
}

function testTestAttributePriority(): void {
  const el = baseElement({
    dataTestId: FIXTURE.submitTestId,
    dataTest: FIXTURE.legacyTestAttr,
    dataCy: FIXTURE.cyAttr,
  })
  assert.deepEqual(pickTestAttribute(el), { attr: 'data-testid', value: FIXTURE.submitTestId })
}

function testLocatorPriorityOrder(): void {
  const withCy = baseElement({ dataCy: FIXTURE.primaryActionCy, id: FIXTURE.stableFormId })
  assert.equal(pickElementLocator(withCy).strategy, 'data-cy')

  const withRole = baseElement({
    role: 'button',
    accessibleName: FIXTURE.accessibleActionLabel,
    id: FIXTURE.stableFormId,
  })
  assert.equal(pickElementLocator(withRole).strategy, 'id')

  const dynamicIdOnly = baseElement({
    id: FIXTURE.dynamicTableId,
    tagName: 'div',
    kind: 'unknown',
  })
  assert.notEqual(pickElementLocator(dynamicIdOnly).strategy, 'id')

  const stableId = baseElement({ id: FIXTURE.stableFormId, tagName: 'form', kind: 'unknown' })
  assert.equal(pickElementLocator(stableId).strategy, 'id')

  const nameInput = baseElement({
    kind: 'input-text',
    tagName: 'input',
    type: 'text',
    name: FIXTURE.fieldName,
  })
  assert.equal(pickElementLocator(nameInput).strategy, 'name')
}

function testRelativePath(): void {
  const containerAncestor = ancestorWithTestId(FIXTURE.containerTestId)
  const el = baseElement({
    kind: 'unknown',
    tagName: 'div',
    classes: [FIXTURE.listClass],
    ancestorSelectors: [containerAncestor, `div.${FIXTURE.wrapperClass}`],
  })
  const locator = pickElementLocator(el)
  assert.equal(locator.strategy, 'css-path')
  assert.match(locator.selector, new RegExp(`\\[data-testid="${FIXTURE.containerTestId}"\\]`))
  assert.match(locator.selector, new RegExp(`\\[class\\*="${FIXTURE.listClassToken}"\\]`))
  assert.ok(!locator.selector.includes('html'))
}

function testClassContainsSelector(): void {
  const el = baseElement({
    kind: 'input-text',
    tagName: 'input',
    type: 'text',
    classes: [FIXTURE.genericInputClass, FIXTURE.semanticInputClass],
  })
  const locator = pickElementLocator(el)
  assert.equal(locator.strategy, 'class-contains')
  assert.match(locator.selector, new RegExp(`\\[class\\*="${FIXTURE.semanticInputClass}"\\]`))
}

function testAttributePriorityBeforeClass(): void {
  const withName = baseElement({
    kind: 'input-text',
    tagName: 'input',
    type: 'text',
    name: FIXTURE.fieldName,
    classes: [FIXTURE.semanticInputClass],
  })
  assert.equal(pickElementLocator(withName).strategy, 'name')

  const withPlaceholder = baseElement({
    kind: 'input-text',
    tagName: 'input',
    type: 'text',
    placeholder: FIXTURE.fieldPlaceholder,
    classes: [FIXTURE.semanticInputClass],
  })
  assert.equal(pickElementLocator(withPlaceholder).strategy, 'placeholder')
}

function run(): void {
  testDynamicIds()
  testTestAttributePriority()
  testLocatorPriorityOrder()
  testRelativePath()
  testClassContainsSelector()
  testAttributePriorityBeforeClass()
  console.log('locator-priority: all tests passed')
}

run()
