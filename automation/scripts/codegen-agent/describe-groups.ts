import { TestCase, TestGroup } from './types'

/** Standard describe sections — order preserved in generated specs. */
export const DESCRIBE_SECTION_ORDER = [
  'Explore',
  'Core flows',
  'Happy path',
  'Validation',
  'Accessibility',
  'Edge cases',
] as const

export type DescribeSection = (typeof DESCRIBE_SECTION_ORDER)[number]

const PLANNER_GROUP_TO_SECTION: Record<string, DescribeSection> = {
  Explore: 'Explore',
  List: 'Core flows',
  Sort: 'Core flows',
  Cart: 'Core flows',
  Detail: 'Core flows',
  'Happy Path': 'Happy path',
  Validation: 'Validation',
  Accessibility: 'Accessibility',
  'Designed Coverage': 'Edge cases',
}

export function consolidateTestGroups(groups: TestGroup[]): TestGroup[] {
  const bucketCases = new Map<DescribeSection, TestCase[]>()

  for (const group of groups) {
    const section = PLANNER_GROUP_TO_SECTION[group.groupName] ?? (group.groupName as DescribeSection)
    const existing = bucketCases.get(section) ?? []
    bucketCases.set(section, [...existing, ...group.cases])
  }

  return DESCRIBE_SECTION_ORDER.filter((section) => bucketCases.has(section)).map((groupName) => ({
    groupName,
    requiresApiSetup: false,
    apiSetupDescription: '',
    apiEndpoint: '',
    stateKey: '',
    cases: bucketCases.get(groupName)!,
  }))
}
