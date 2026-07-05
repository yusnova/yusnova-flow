import assert from 'node:assert/strict'
import { consolidateTestGroups } from './describe-groups'
import { TestGroup } from './types'
import { cleanVerifyTitle, toTestName } from './test-naming'

function testNaming(): void {
  assert.equal(
    cleanVerifyTitle('Regression smoke for unstable area in codebase-scanner.ts'),
    'the page handles unexpected input without breaking',
  )
  assert.equal(
    toTestName('invalid query parameter does not break the product list'),
    'InvalidQueryParameterDoesNotBreakProductList',
  )
  assert.equal(
    toTestName('sorting by price (low to high) updates the product list'),
    'SortingPriceLowHighUpdatesProductList',
  )
  assert.equal(
    toTestName('the product list is visible without user interaction'),
    'ProductListVisibleWithoutUserInteraction',
  )
}

function testDescribeConsolidation(): void {
  const groups: TestGroup[] = [
    {
      groupName: 'Explore',
      requiresApiSetup: false,
      apiSetupDescription: '',
      apiEndpoint: '',
      stateKey: '',
      cases: [{ id: '1', title: 'explore', caseType: 'happy-path', fixtures: 'p', steps: [], requiresApiSetup: false }],
    },
    {
      groupName: 'List',
      requiresApiSetup: false,
      apiSetupDescription: '',
      apiEndpoint: '',
      stateKey: '',
      cases: [{ id: '2', title: 'list', caseType: 'happy-path', fixtures: 'p', steps: [], requiresApiSetup: false }],
    },
    {
      groupName: 'Sort',
      requiresApiSetup: false,
      apiSetupDescription: '',
      apiEndpoint: '',
      stateKey: '',
      cases: [{ id: '3', title: 'sort', caseType: 'happy-path', fixtures: 'p', steps: [], requiresApiSetup: false }],
    },
    {
      groupName: 'Designed Coverage',
      requiresApiSetup: false,
      apiSetupDescription: '',
      apiEndpoint: '',
      stateKey: '',
      cases: [{ id: '4', title: 'edge', caseType: 'negative', fixtures: 'p', steps: [], requiresApiSetup: false }],
    },
  ]

  const consolidated = consolidateTestGroups(groups)
  assert.deepEqual(
    consolidated.map((group) => group.groupName),
    ['Explore', 'Core flows', 'Edge cases'],
  )
  assert.equal(consolidated[1]!.cases.length, 2)
}

function run(): void {
  testNaming()
  testDescribeConsolidation()
  console.log('test-naming: all tests passed')
}

run()
