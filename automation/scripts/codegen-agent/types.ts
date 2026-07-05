export type ElementKind =
  | 'input-text'
  | 'input-email'
  | 'input-password'
  | 'input-number'
  | 'input-checkbox'
  | 'input-radio'
  | 'input-file'
  | 'button'
  | 'select'
  | 'textarea'
  | 'link'
  | 'unknown'

export type LocatorStrategyName =
  | 'data-testid'
  | 'data-test-id'
  | 'data-test'
  | 'data-cy'
  | 'data-qa'
  | 'role'
  | 'id'
  | 'name'
  | 'aria-label'
  | 'placeholder'
  | 'text'
  | 'class-contains'
  | 'css-path'
  | 'nth'

export type LocatorConfidence = 'high' | 'medium' | 'low'

export type UiAction =
  | 'fillInput'
  | 'clickElement'
  | 'checkCheckbox'
  | 'selectOption'
  | 'uploadFile'

export type PagePattern =
  | 'login'
  | 'registration'
  | 'password-change'
  | 'search'
  | 'inventory'
  | 'generic-form'

export type TestType = 'ui' | 'api' | 'e2e'

export type TestCaseType = 'happy-path' | 'negative' | 'boundary' | 'accessibility'

export interface ElementInfo {
  kind: ElementKind
  tagName: string
  type?: string
  id?: string
  dataTestId?: string
  dataTestIdHyphen?: string
  dataTest?: string
  dataCy?: string
  dataQa?: string
  role?: string
  accessibleName?: string
  name?: string
  ariaLabel?: string
  placeholder?: string
  textContent?: string
  href?: string
  classes: string[]
  parentPath: string
  ancestorSelectors: string[]
  isRequired: boolean
  isDisabled: boolean
  index: number
  /** Visible option labels for select elements (excludes empty placeholder options). */
  selectOptions?: string[]
}

export interface ElementMap {
  url: string
  pageTitle: string
  elements: ElementInfo[]
  timestamp: string
}

export interface LocatorResult {
  selector: string
  strategy: LocatorStrategyName
  confidence: LocatorConfidence
}

export interface ResolvedElement extends ElementInfo {
  propertyName: string
  label: string
  locator: LocatorResult
  uiAction: UiAction
}

export interface GeneratorOptions {
  url: string
  domain: string
  page: string
  type: TestType
  headless: boolean
  overwrite: boolean
  codegenFile?: string
  noCodegen: boolean
  storageState?: string
  explore: boolean
}

export interface TestStep {
  description: string
  code: string[]
}

export interface TestCase {
  id: string
  title: string
  caseType: TestCaseType
  fixtures: string
  steps: TestStep[]
  requiresApiSetup: boolean
  fixme?: boolean
}

export interface TestGroup {
  groupName: string
  requiresApiSetup: boolean
  apiSetupDescription: string
  apiEndpoint: string
  stateKey: string
  cases: TestCase[]
}

export interface TestPlan {
  pageName: string
  domain: string
  url: string
  pattern: PagePattern
  elements: ResolvedElement[]
  testGroups: TestGroup[]
}

export interface CodegenAction {
  original: string
  transformed: string
  isRemoved: boolean
}

export interface PomMethodStep {
  line: string
}

export interface PomMethod {
  name: string
  params: string
  steps: PomMethodStep[]
}

export interface PomLocatorMethod {
  name: string
  params: string
  body: string
}

export interface PomTemplateData {
  pageName: string
  domain: string
  fileName: string
  locators: Array<{ propertyName: string; selector: string }>
  locatorMethods: PomLocatorMethod[]
  methods: PomMethod[]
}

export interface SpecStepData {
  description: string
  lines: string[]
}

export interface SpecCaseData {
  id: string
  title: string
  testName: string
  fixtures: string
  steps: SpecStepData[]
  fixme?: boolean
}

export interface SpecGroupData {
  groupName: string
  requiresApiSetup: boolean
  apiSetupDescription: string
  apiEndpoint: string
  stateKey: string
  cases: SpecCaseData[]
}

export interface SpecTemplateData {
  domain: string
  pageName: string
  pageVar: string
  fixtureImport: string
  testTypeLabel: string
  groups: SpecGroupData[]
}
