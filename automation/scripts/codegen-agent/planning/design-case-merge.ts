import { actionMethodName } from '@codegen-agent/locators/element-naming'
import { collapseRepeatingLocators } from '@codegen-agent/locators/repeating-locators'
import { pomGroupListExpr, pomLocatorExpr, resolvePomElementByDataTest } from '@codegen-agent/writers/pom-ref'
import {
  specCaptureText,
  specClickElement,
  specExpectContentChanged,
  specExpectPageLoaded,
  specFillElement,
  specSelectOption,
} from '@codegen-agent/writers/spec-pom-lines'
import { toPageVar } from '@codegen-agent/naming/page-name'
import {
  PagePattern,
  ResolvedElement,
  TestCase,
  TestGroup,
  TestPlan,
  TestStep,
} from '../types'
import { gotoPathFromUrl } from '@codegen-agent/utils/url-utils'
import { cleanVerifyTitle, looksLikeInternalDesignedTitle } from '@codegen-agent/naming/test-naming'
import { classifyLinkTarget, escapeRegExp, isDestructiveLabel } from '@codegen-agent/safety/interaction-safety'

export interface DesignedCaseMergeInput {
  id: string
  title: string
  type: 'happy-path' | 'negative' | 'boundary' | 'edge'
  level: 'unit' | 'api' | 'ui' | 'e2e'
  acceptanceCriteriaIds: string[]
  acTexts: string[]
  steps: string[]
}

export interface DesignMergeResult {
  plan: TestPlan
  scaffoldCaseCount: number
  coveredDesignedIds: string[]
  addedDesignedIds: string[]
  skippedDesignedIds: string[]
}

const STOP_WORDS = new Set([
  'verify', 'that', 'user', 'must', 'able', 'with', 'the', 'and', 'from', 'page', 'ac',
])

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/^verify\s+ac:\s*/i, '')
      .replace(/\bwith invalid input\b/g, '')
      .replace(/\bwith empty required fields\b/g, '')
      .replace(/\bwith boundary values\b/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  )
}

function overlapRatio(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let common = 0
  for (const token of ta) {
    if (tb.has(token)) common += 1
  }
  return common / Math.min(ta.size, tb.size)
}

function intentCovered(acOrTitle: string, scaffoldTitle: string, pattern: PagePattern): boolean {
  const text = acOrTitle.toLowerCase()
  const scaffold = scaffoldTitle.toLowerCase()

  if (pattern === 'inventory') {
    if (
      (text.includes('view') || text.includes('list') || text.includes('display'))
      && (scaffold.includes('display') || scaffold.includes('list') || scaffold.includes('items'))
    ) {
      return true
    }
    if (text.includes('sort') && scaffold.includes('sort')) return true
    if ((text.includes('cart') || text.includes('add')) && scaffold.includes('cart')) return true
    if (
      (text.includes('detail') || text.includes('open'))
      && (scaffold.includes('detail') || scaffold.includes('opens'))
    ) {
      return true
    }
  }

  if (pattern === 'login') {
    if (text.includes('login') && scaffold.includes('login')) return true
    if (text.includes('credential') && scaffold.includes('credential')) return true
  }

  if (pattern === 'search') {
    if (text.includes('search') && scaffold.includes('search')) return true
  }

  if (text.includes('product') && !scaffold.includes('product') && pattern !== 'inventory') {
    return false
  }

  if (text.includes('blog') || text.includes('article')) {
    if (scaffold.includes('blog') || scaffold.includes('article') || scaffold.includes('content')) return true
    if (text.includes('listing') && scaffold.includes('list')) return true
  }

  if (text.includes('language') && scaffold.includes('language')) return true
  if (text.includes('navigate') && (scaffold.includes('nav') || scaffold.includes('link'))) return true

  return overlapRatio(acOrTitle, scaffoldTitle) >= 0.6
}

function isDesignedCaseCovered(
  designed: DesignedCaseMergeInput,
  scaffoldCases: Array<{ title: string; caseType: TestCase['caseType'] }>,
  pattern: PagePattern,
): boolean {
  const sources = [designed.title, ...designed.acTexts]

  if (designed.type !== 'happy-path') {
    const matchingScaffold = scaffoldCases.filter(
      (testCase) => testCase.caseType === 'negative' || testCase.caseType === 'boundary',
    )
    if (matchingScaffold.length === 0) return false

    for (const source of sources) {
      for (const scaffold of matchingScaffold) {
        if (overlapRatio(source, scaffold.title) >= 0.55) return true
        if (intentCovered(source, scaffold.title, pattern)) return true
      }
    }
    return false
  }

  const happyScaffolds = scaffoldCases.filter((testCase) => testCase.caseType === 'happy-path')

  for (const source of sources) {
    for (const scaffold of happyScaffolds) {
      if (overlapRatio(source, scaffold.title) >= 0.55) return true
      if (intentCovered(source, scaffold.title, pattern)) return true
    }
  }

  return false
}

function navigateStep(pageVar: string, url: string): TestStep {
  const path = gotoPathFromUrl(url)
  return {
    description: 'Navigate to page',
    code: [`await ${pageVar}.page.goto(${JSON.stringify(path)})`],
  }
}

function makeStep(description: string, code: string[]): TestStep {
  return { description, code }
}

function caseSignature(testCase: TestCase): string {
  return `${testCase.title}::${testCase.steps.map((step) => step.description).join('>')}`
}

function designedTitle(
  designed: DesignedCaseMergeInput,
  plan: TestPlan,
  theme?: ReturnType<typeof inventoryTheme>,
  variant?: ReturnType<typeof designedVariant>,
): string {
  if (plan.pattern === 'inventory' && designed.type !== 'happy-path') {
    return inventoryBehaviorTitle(
      theme ?? inventoryTheme(designed),
      variant ?? designedVariant(designed),
    )
  }

  const cleaned = designed.title.replace(/^Verify AC:\s*/i, '').replace(/^Verify\s+/i, '').trim()
  if (looksLikeInternalDesignedTitle(cleaned)) {
    return 'the page handles unexpected input without breaking'
  }
  return cleanVerifyTitle(cleaned.startsWith('the ') ? cleaned : `the ${cleaned}`)
}

function buildInventoryHappyPath(
  designed: DesignedCaseMergeInput,
  plan: TestPlan,
  pageVar: string,
): TestCase {
  const text = `${designed.title} ${designed.acTexts.join(' ')}`.toLowerCase()
  const { groups } = collapseRepeatingLocators(plan.elements)
  const sortEl = plan.elements.find((e) => e.dataTest === 'product-sort-container')
  const cartEl = resolvePomElementByDataTest(plan.elements, 'shopping-cart-link')
  const productNames = resolvePomElementByDataTest(plan.elements, 'inventory-item-name')
  const titleGroup = groups.find((group) => group.methodName === 'itemTitleLink')
  const hasAddToCartGroup = groups.some((group) => group.methodName === 'addToCart')
  const steps: TestStep[] = [navigateStep(pageVar, plan.url)]

  if ((text.includes('detail') || text.includes('open')) && titleGroup) {
    steps.push(
      makeStep('Open product detail from list', [`await ${pageVar}.openItemTitle(0)`]),
      makeStep('Assert detail page URL', [`await expect(${pageVar}.page).toHaveURL(/inventory-item/)`]),
    )
  } else if (text.includes('sort') && sortEl) {
    steps.push(
      makeStep('Sort products by price', [
        `await ${pageVar}.${actionMethodName(sortEl.propertyName, 'selectOption')}('Price (low to high)')`,
      ]),
      makeStep('Assert sort applied', [
        productNames
          ? `await expect(${pomLocatorExpr(pageVar, productNames, 'first')}).toBeVisible()`
          : `await expect(${pageVar}.page).toHaveURL(/inventory/)`,
      ]),
    )
  } else if ((text.includes('cart') || text.includes('add')) && hasAddToCartGroup) {
    steps.push(
      makeStep('Add product to cart', [`await ${pageVar}.addProductToCart('sample-product')`]),
      makeStep('Assert cart badge', [
        cartEl
          ? `await expect(${pageVar}.${cartEl.propertyName}).toBeVisible()`
          : `await expect(${pageVar}.page).toHaveURL(/inventory/)`,
      ]),
    )
  } else if (text.includes('view') || text.includes('list') || text.includes('display')) {
    steps.push(
      makeStep('Assert product list is visible', [
        `await expect(${pageVar}.page).toHaveURL(/inventory/)`,
        productNames
          ? `await expect(${pomLocatorExpr(pageVar, productNames)}).toHaveCount(6)`
          : titleGroup
            ? `await expect(${pomGroupListExpr(pageVar, titleGroup)}).toHaveCount(6)`
            : `await expect(${pageVar}.page).toHaveURL(/inventory/)`,
      ]),
    )
  } else {
    steps.push(makeStep('Assert page is usable', [`await expect(${pageVar}.page).toHaveURL(/.+/)`]))
  }

  return {
    id: designed.id,
    title: designedTitle(designed, plan),
    caseType: 'happy-path',
    fixtures: pageVar,
    steps,
    requiresApiSetup: false,
  }
}

export interface AcAssertionTarget {
  phrase: string
  /** "title" ACs (e.g. `shows the "X" title`) describe document.title, not visible body text. */
  kind: 'title' | 'text'
}

/** Pulls a concrete, checkable phrase out of an AC like `Page shows the "The Internet" title`. */
export function extractAcAssertionTarget(acTexts: string[]): AcAssertionTarget | undefined {
  for (const text of acTexts) {
    const decoded = text.replace(/&quot;/g, '"')
    const match = decoded.match(/"([^"]{2,80})"/)
    if (match?.[1]) {
      return { phrase: match[1], kind: /\btitle\b/i.test(decoded) ? 'title' : 'text' }
    }
  }
  return undefined
}

function pickInteractiveCandidate(plan: TestPlan): ResolvedElement | undefined {
  return plan.elements
    .filter((e) => e.kind === 'link' || e.kind === 'button')
    .find((e) => {
      const label = e.label || e.accessibleName || e.textContent || ''
      if (isDestructiveLabel(label)) return false
      if (e.kind === 'link' && classifyLinkTarget(e.href ?? '', plan.url) === 'external') return false
      return true
    })
}

/** Verifies the observable effect of the page's primary interactive element instead of a generic assertion. */
function buildInteractiveHappyPath(
  designed: DesignedCaseMergeInput,
  plan: TestPlan,
  pageVar: string,
): TestCase | undefined {
  const candidate = pickInteractiveCandidate(plan)
  if (!candidate) return undefined

  const label = candidate.label || candidate.accessibleName || candidate.textContent || 'element'
  const isInternalNav = candidate.kind === 'link' && classifyLinkTarget(candidate.href ?? '', plan.url) === 'internal-nav'

  const actionStep = isInternalNav
    ? makeStep(`Click "${label}" and assert navigation`, [
        specClickElement(pageVar, candidate),
        (() => {
          try {
            const destinationPath = new URL(candidate.href ?? '', plan.url).pathname
            return `await expect(${pageVar}.page).toHaveURL(/${escapeRegExp(destinationPath)}/)`
          } catch {
            return `await expect(${pageVar}.page).toHaveURL(/.+/, { timeout: 15_000 })`
          }
        })(),
      ])
    : makeStep(`Click "${label}" and assert content changes`, [
        specCaptureText(pageVar, 'beforeText'),
        specClickElement(pageVar, candidate),
        specExpectContentChanged(pageVar, 'beforeText'),
      ])

  return {
    id: designed.id,
    title: designedTitle(designed, plan),
    caseType: 'happy-path',
    fixtures: pageVar,
    requiresApiSetup: false,
    steps: [navigateStep(pageVar, plan.url), actionStep],
  }
}

function buildGenericHappyPath(
  designed: DesignedCaseMergeInput,
  plan: TestPlan,
  pageVar: string,
): TestCase {
  const acTarget = extractAcAssertionTarget(designed.acTexts)

  if (!acTarget && plan.pattern === 'interactive') {
    const interactive = buildInteractiveHappyPath(designed, plan, pageVar)
    if (interactive) return interactive
  }

  const submitEl = plan.elements.find((e) => e.uiAction === 'clickElement' && e.kind === 'button')
  const fillEls = plan.elements.filter((e) => e.uiAction === 'fillInput').slice(0, 2)

  const outcomeAssertion = acTarget
    ? acTarget.kind === 'title'
      ? `await expect(${pageVar}.page).toHaveTitle(new RegExp(${JSON.stringify(escapeRegExp(acTarget.phrase))}))`
      : `await expect(${pageVar}.page.locator('body')).toContainText(${JSON.stringify(acTarget.phrase)})`
    : `await expect(${pageVar}.page).toHaveURL(/.+/, { timeout: 15_000 })`

  return {
    id: designed.id,
    title: designedTitle(designed, plan),
    caseType: 'happy-path',
    fixtures: pageVar,
    requiresApiSetup: false,
    steps: [
      navigateStep(pageVar, plan.url),
      makeStep(
        'Perform primary action from design',
        fillEls.length > 0
          ? fillEls.map((el) => specFillElement(pageVar, el, 'test value'))
          : [specExpectPageLoaded(pageVar)],
      ),
      makeStep('Submit or confirm', [
        submitEl
          ? specClickElement(pageVar, submitEl)
          : specExpectPageLoaded(pageVar),
      ]),
      makeStep(
        acTarget ? 'Assert AC-described content is visible' : 'Assert expected outcome',
        [outcomeAssertion],
      ),
    ],
  }
}

function buildDesignedTestCase(
  designed: DesignedCaseMergeInput,
  plan: TestPlan,
  pageVar: string,
): TestCase {
  if (designed.level === 'ui' && plan.pattern === 'inventory') {
    if (designed.type === 'happy-path') {
      return buildInventoryHappyPath(designed, plan, pageVar)
    }
    return buildInventoryNegativeBoundary(designed, plan, pageVar)
  }

  if (designed.type === 'happy-path' && designed.level === 'ui') {
    return buildGenericHappyPath(designed, plan, pageVar)
  }

  const path = gotoPathFromUrl(plan.url)
  const caseType = designed.type === 'boundary' ? 'boundary' : 'negative'

  return {
    id: designed.id,
    title: designedTitle(designed, plan),
    caseType,
    fixtures: pageVar,
    requiresApiSetup: false,
    fixme: true,
    steps: [
      {
        description: designed.steps.join(' → '),
        code: [
          `await ${pageVar}.page.goto(${JSON.stringify(path)})`,
          specExpectPageLoaded(pageVar),
        ],
      },
    ],
  }
}

function inventoryBehaviorTitle(
  theme: ReturnType<typeof inventoryTheme>,
  variant: ReturnType<typeof designedVariant>,
): string {
  const phrases: Record<ReturnType<typeof inventoryTheme>, Record<ReturnType<typeof designedVariant>, string>> = {
    list: {
      invalid: 'invalid query parameter does not break the product list',
      empty: 'the product list is visible without user interaction',
      boundary: 'the catalog shows the expected product count at list boundaries',
    },
    cart: {
      invalid: 'adding a non-existent product does not update the cart badge',
      empty: 'the cart badge stays empty when no product is added',
      boundary: 'the cart badge reflects the correct count for multiple products',
    },
    sort: {
      invalid: 'invalid sort options are not offered in the dropdown',
      empty: 'the product list remains visible with the default sort selection',
      boundary: 'sorting toggles between price orders without breaking the list',
    },
    detail: {
      invalid: 'out-of-range product links are not available on the list',
      empty: 'the user stays on the inventory list without opening a product',
      boundary: 'first and last products in the catalog open the detail page',
    },
  }
  return phrases[theme][variant]
}

function inventoryTheme(designed: DesignedCaseMergeInput): 'list' | 'cart' | 'sort' | 'detail' {
  const text = `${designed.title} ${designed.acTexts.join(' ')}`.toLowerCase()
  if (text.includes('cart') || text.includes('add')) return 'cart'
  if (text.includes('sort') || text.includes('price')) return 'sort'
  if (text.includes('detail') || text.includes('open')) return 'detail'
  return 'list'
}

function designedVariant(designed: DesignedCaseMergeInput): 'invalid' | 'empty' | 'boundary' {
  const title = designed.title.toLowerCase()
  if (title.includes('boundary')) return 'boundary'
  if (title.includes('empty')) return 'empty'
  return 'invalid'
}

function buildInventoryNegativeBoundary(
  designed: DesignedCaseMergeInput,
  plan: TestPlan,
  pageVar: string,
): TestCase {
  const theme = inventoryTheme(designed)
  const variant = designedVariant(designed)
  const caseType = designed.type === 'boundary' ? 'boundary' : 'negative'
  const productNames = resolvePomElementByDataTest(plan.elements, 'inventory-item-name')
  const productListAssert = productNames
    ? `await expect(${pomLocatorExpr(pageVar, productNames)}).toHaveCount(6)`
    : `await expect(${pageVar}.inventoryItemName).toHaveCount(6)`

  const steps: TestStep[] = [navigateStep(pageVar, plan.url)]

  if (theme === 'list') {
    if (variant === 'invalid') {
      steps.push(
        makeStep('Open inventory with unsupported query parameter', [
          `await ${pageVar}.page.goto("/inventory.html?sort=invalid-value")`,
        ]),
        makeStep('Assert product list still renders', [
          `await expect(${pageVar}.page).toHaveURL(/inventory/)`,
          productListAssert,
        ]),
      )
    } else if (variant === 'empty') {
      steps.push(
        makeStep('Land on inventory without interacting with filters or cart', []),
        makeStep('Assert list is visible without user input', [
          `await expect(${pageVar}.page).toHaveURL(/inventory/)`,
          productListAssert,
        ]),
      )
    } else {
      steps.push(
        makeStep('Assert catalog boundary size on inventory page', [
          productListAssert,
          `await expect(${pageVar}.inventoryItemName.first()).toBeVisible()`,
          `await expect(${pageVar}.inventoryItemName.nth(5)).toBeVisible()`,
        ]),
      )
    }
  } else if (theme === 'cart') {
    if (variant === 'invalid') {
      steps.push(
        makeStep('Assert add-to-cart control is absent for unknown product slug', [
          `await expect(${pageVar}.addToCart('non-existent-product-slug')).toHaveCount(0)`,
        ]),
        makeStep('Assert cart badge is not shown without valid add action', [
          `await expect(${pageVar}.page.locator('.shopping_cart_badge')).toHaveCount(0)`,
        ]),
      )
    } else if (variant === 'empty') {
      steps.push(
        makeStep('Do not add any product to the cart', []),
        makeStep('Assert cart icon is visible and badge stays empty', [
          `await expect(${pageVar}.shoppingCartLink).toBeVisible()`,
          `await expect(${pageVar}.page.locator('.shopping_cart_badge')).toHaveCount(0)`,
        ]),
      )
    } else {
      steps.push(
        makeStep('Add first and last catalog products to cart', [
          `await ${pageVar}.addProductToCart('sample-product')`,
          `await ${pageVar}.addProductToCart('sample-red-tshirt')`,
        ]),
        makeStep('Assert cart badge shows boundary count of two items', [
          `await expect(${pageVar}.page.locator('.shopping_cart_badge')).toHaveText('2')`,
        ]),
      )
    }
  } else if (theme === 'sort') {
    if (variant === 'invalid') {
      steps.push(
        makeStep('Assert invalid sort option is not offered', [
          `await expect(${pageVar}.productSortSelect.locator('option', { hasText: 'Invalid' })).toHaveCount(0)`,
        ]),
        makeStep('Assert default product list remains visible', [productListAssert]),
      )
    } else if (variant === 'empty') {
      steps.push(
        makeStep('Leave sort dropdown at default without changing selection', []),
        makeStep('Assert products remain listed', [
          `await expect(${pageVar}.productSortSelect).toBeVisible()`,
          productListAssert,
        ]),
      )
    } else {
      steps.push(
        makeStep('Sort by lowest price then highest price', [
          `await ${pageVar}.selectProductSort('Price (low to high)')`,
          `await expect(${pageVar}.inventoryItemName.first()).toBeVisible()`,
          `await ${pageVar}.selectProductSort('Price (high to low)')`,
        ]),
        makeStep('Assert list still shows full catalog after boundary sort toggles', [productListAssert]),
      )
    }
  } else if (variant === 'invalid') {
    steps.push(
      makeStep('Assert out-of-range product title link does not exist', [
        `await expect(${pageVar}.itemTitleLinks()).toHaveCount(6)`,
        `await expect(${pageVar}.itemTitleLinks().nth(99)).toHaveCount(0)`,
      ]),
      makeStep('Assert user remains on inventory list', [
        `await expect(${pageVar}.page).toHaveURL(/inventory/)`,
      ]),
    )
  } else if (variant === 'empty') {
    steps.push(
      makeStep('Stay on inventory list without opening a product', []),
      makeStep('Assert detail route is not opened', [
        `await expect(${pageVar}.page).toHaveURL(/inventory/)`,
        `await expect(${pageVar}.page).not.toHaveURL(/inventory-item/)`,
      ]),
    )
  } else {
    steps.push(
      makeStep('Open first and last products from the list', [
        `await ${pageVar}.openItemTitle(0)`,
        `await expect(${pageVar}.page).toHaveURL(/inventory-item/)`,
        `await ${pageVar}.page.goBack()`,
        `await ${pageVar}.openItemTitle(5)`,
      ]),
      makeStep('Assert boundary index opens detail page', [
        `await expect(${pageVar}.page).toHaveURL(/inventory-item/)`,
      ]),
    )
  }

  return {
    id: designed.id,
    title: designedTitle(designed, plan, theme, variant),
    caseType,
    fixtures: pageVar,
    steps,
    requiresApiSetup: false,
  }
}

export function mergeDesignCasesIntoPlan(
  plan: TestPlan,
  designedCases: DesignedCaseMergeInput[],
): DesignMergeResult {
  const scaffoldCaseCount = plan.testGroups.reduce((sum, group) => sum + group.cases.length, 0)
  const scaffoldCases = plan.testGroups.flatMap((group) =>
    group.cases.map((testCase) => ({ title: testCase.title, caseType: testCase.caseType })),
  )
  const pageVar = toPageVar(plan.pageName)

  const coveredDesignedIds: string[] = []
  const addedDesignedIds: string[] = []
  const skippedDesignedIds: string[] = []
  const addedCases: TestCase[] = []

  const addedSignatures = new Set<string>()

  for (const designed of designedCases) {
    if (designed.level !== 'ui' && plan.pattern !== 'generic-form' && plan.pattern !== 'interactive') {
      skippedDesignedIds.push(designed.id)
      continue
    }

    if (isDesignedCaseCovered(designed, scaffoldCases, plan.pattern)) {
      coveredDesignedIds.push(designed.id)
      continue
    }

    const built = buildDesignedTestCase(designed, plan, pageVar)
    const signature = caseSignature(built)
    if (addedSignatures.has(signature)) {
      skippedDesignedIds.push(designed.id)
      continue
    }

    addedCases.push(built)
    addedSignatures.add(signature)
    addedDesignedIds.push(designed.id)
  }

  if (addedCases.length === 0) {
    return {
      plan,
      scaffoldCaseCount,
      coveredDesignedIds,
      addedDesignedIds,
      skippedDesignedIds,
    }
  }

  const designedGroup: TestGroup = {
    groupName: 'Designed Coverage',
    requiresApiSetup: false,
    apiSetupDescription: '',
    apiEndpoint: '',
    stateKey: '',
    cases: addedCases,
  }

  return {
    plan: {
      ...plan,
      testGroups: [...plan.testGroups, designedGroup],
    },
    scaffoldCaseCount,
    coveredDesignedIds,
    addedDesignedIds,
    skippedDesignedIds,
  }
}
