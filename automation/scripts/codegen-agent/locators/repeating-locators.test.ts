import assert from 'node:assert/strict'
import { collapseRepeatingLocators, findRepeatingGroupForDataTest } from './repeating-locators'
import type { ResolvedElement } from '../types'

function el(
  kind: ResolvedElement['kind'],
  dataTest: string,
  propertyName: string,
  uiAction: ResolvedElement['uiAction'],
): ResolvedElement {
  return {
    kind,
    propertyName,
    label: dataTest,
    dataTest,
    dataTestId: dataTest,
    locator: { strategy: 'data-testid', selector: `[data-testid="${dataTest}"]`, confidence: 'high' },
    uiAction,
  } as ResolvedElement
}

const radio = (dataTest: string, propertyName: string) =>
  el('input-radio', dataTest, propertyName, 'checkCheckbox')
const button = (dataTest: string, propertyName: string) =>
  el('button', dataTest, propertyName, 'clickElement')

const elements = [
  radio('address-option-addr_1', 'addressOptionAddr1Radio'),
  radio('address-option-addr_2', 'addressOptionAddr2Radio'),
  radio('address-option-addr_3', 'addressOptionAddr3Radio'),
  radio('skip-option-2-yard', 'skipOption2YardRadio'),
  radio('skip-option-4-yard', 'skipOption4YardRadio'),
  radio('skip-option-6-yard', 'skipOption6YardRadio'),
  button('waste-path-general', 'wastePathGeneralBtn'),
  button('waste-path-heavy', 'wastePathHeavyBtn'),
  button('waste-path-plasterboard', 'wastePathPlasterboardBtn'),
  button('next-from-step1', 'nextFromStep1Btn'),
  button('next-from-step2', 'nextFromStep2Btn'),
  button('next-from-step3', 'nextFromStep3Btn'),
  button('lookup-button', 'lookupButtonBtn'),
  button('confirm-booking', 'confirmBookingBtn'),
]

const { singles, groups } = collapseRepeatingLocators(elements)

assert.ok(groups.some((g) => g.methodName === 'addressOption'), `expected addressOption, got ${groups.map((g) => g.methodName)}`)
assert.ok(groups.some((g) => g.methodName === 'skipOption'), `expected skipOption slug group, got ${groups.map((g) => g.methodName)}`)
assert.ok(groups.some((g) => g.methodName === 'wastePath'), `expected wastePath, got ${groups.map((g) => g.methodName)}`)
assert.ok(groups.some((g) => g.methodName === 'nextFrom'), `expected nextFrom, got ${groups.map((g) => g.methodName)}`)

const skip = groups.find((g) => g.methodName === 'skipOption')!
assert.equal(skip.paramType, 'string')
const skipHit = findRepeatingGroupForDataTest(groups, 'skip-option-2-yard')
assert.ok(skipHit)
assert.equal(skipHit!.arg, '2-yard')

const wasteHit = findRepeatingGroupForDataTest(groups, 'waste-path-general')
assert.ok(wasteHit)
assert.equal(wasteHit!.group.methodName, 'wastePath')
assert.equal(wasteHit!.arg, 'general')

const nextHit = findRepeatingGroupForDataTest(groups, 'next-from-step1')
assert.ok(nextHit)
assert.equal(nextHit!.arg, 'step1')

assert.ok(singles.some((s) => s.propertyName === 'lookupButtonBtn'), 'unique buttons stay singles')
assert.ok(singles.some((s) => s.propertyName === 'confirmBookingBtn'), 'unique buttons stay singles')

console.log('repeating-locators.test.ts: all assertions passed')
console.log(groups.map((g) => ({ name: g.methodName, template: g.selectorTemplate, n: g.memberPropertyNames.length })))
console.log('singles', singles.map((s) => s.propertyName))
