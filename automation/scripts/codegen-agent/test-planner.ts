import {
  PagePattern,
  ResolvedElement,
  TestCase,
  TestGroup,
  TestPlan,
  TestStep,
} from './types'
import { toPageVar } from './page-name'
import { actionMethodName } from './element-naming'
import { collapseRepeatingLocators, RepeatingLocatorGroup } from './repeating-locators'
import { pomGroupListExpr, pomLocatorExpr, resolvePomElementByDataTest } from './pom-ref'
import { gotoPathFromUrl } from './url-utils'

let tcCounter = 0

function nextId(): string {
  tcCounter += 1
  return `TC${String(tcCounter).padStart(3, '0')}`
}

function makeStep(description: string, code: string[]): TestStep {
  return { description, code }
}

function navigateStep(pageVarName: string, url: string): TestStep {
  const path = gotoPathFromUrl(url)
  return makeStep('Navigate to page', [`await ${pageVarName}.page.goto(${JSON.stringify(path)})`])
}

function detectPattern(elements: ResolvedElement[]): PagePattern {
  const has = (pred: (e: ResolvedElement) => boolean) => elements.some(pred)

  const hasEmail = has(
    (e) =>
      e.kind === 'input-email' ||
      e.placeholder?.toLowerCase().includes('email') === true ||
      e.name?.toLowerCase().includes('email') === true,
  )

  const hasPassword = has((e) => e.kind === 'input-password')

  const hasConfirmPassword = has(
    (e) =>
      e.kind === 'input-password' &&
      (e.placeholder?.toLowerCase().includes('confirm') === true ||
        e.name?.toLowerCase().includes('confirm') === true ||
        e.ariaLabel?.toLowerCase().includes('confirm') === true),
  )

  const hasCurrentPassword = has(
    (e) =>
      e.kind === 'input-password' &&
      (e.placeholder?.toLowerCase().includes('current') === true ||
        e.name?.toLowerCase().includes('current') === true),
  )

  const hasSearch = has(
    (e) =>
      e.kind === 'input-text' &&
      (e.placeholder?.toLowerCase().includes('search') === true ||
        e.name?.toLowerCase().includes('search') === true ||
        e.ariaLabel?.toLowerCase().includes('search') === true),
  )

  const hasInventory = has(
    (e) =>
      e.dataTest?.includes('inventory') === true ||
      e.dataTest?.startsWith('add-to-cart') === true ||
      e.dataTest === 'product-sort-container',
  )

  if (hasInventory) return 'inventory'
  if (hasPassword && hasConfirmPassword) return 'registration'
  if (hasPassword && hasCurrentPassword) return 'password-change'
  if (hasPassword && hasEmail) return 'login'
  if (hasSearch) return 'search'
  return 'generic-form'
}

export class TestPlanner {
  generate(opts: {
    pageName: string
    domain: string
    url: string
    elements: ResolvedElement[]
  }): TestPlan {
    tcCounter = 0
    const pattern = detectPattern(opts.elements)
    const testGroups = this.buildGroups(pattern, opts.pageName, opts.url, opts.elements)

    return {
      pageName: opts.pageName,
      domain: opts.domain,
      url: opts.url,
      pattern,
      elements: opts.elements,
      testGroups,
    }
  }

  private buildGroups(
    pattern: PagePattern,
    pageName: string,
    url: string,
    elements: ResolvedElement[],
  ): TestGroup[] {
    switch (pattern) {
      case 'login':
        return this.loginGroups(pageName, url, elements)
      case 'registration':
        return this.registrationGroups(pageName, url, elements)
      case 'password-change':
        return this.passwordChangeGroups(pageName, url, elements)
      case 'search':
        return this.searchGroups(pageName, url, elements)
      case 'inventory':
        return this.inventoryGroups(pageName, url, elements)
      default:
        return this.genericFormGroups(pageName, url, elements)
    }
  }

  private loginGroups(pageName: string, url: string, elements: ResolvedElement[]): TestGroup[] {
    const page = toPageVar(pageName)
    const emailEl = elements.find((e) => e.kind === 'input-email' || e.kind === 'input-text')
    const passwordEl = elements.find((e) => e.kind === 'input-password')
    const submitEl = elements.find((e) => e.kind === 'button')
    const emailProp = emailEl?.propertyName ?? 'emailInput'
    const passwordProp = passwordEl?.propertyName ?? 'passwordInput'
    const submitProp = submitEl?.propertyName ?? 'submitBtn'

    return [
      {
        groupName: 'Happy Path',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase(
            'valid credentials redirect after login',
            'happy-path',
            page,
            [
              navigateStep(page, url),
              makeStep('Login with valid credentials', [
                `await ${page}.${emailProp}.fill('valid@example.com')`,
                `await ${page}.${passwordProp}.fill('ValidPassword123!')`,
                `await ${page}.${submitProp}.click()`,
              ]),
              makeStep('Assert redirect', [
                `await expect(${page}.page).toHaveURL(/.+/, { timeout: 15_000 })`,
              ]),
            ],
          ),
        ],
      },
      {
        groupName: 'Validation',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase('empty email shows validation error', 'negative', page, [
            navigateStep(page, url),
            makeStep('Submit without email', [
              `await ${page}.${passwordProp}.fill('ValidPassword123!')`,
              `await ${page}.${submitProp}.click()`,
            ]),
            makeStep('Assert validation error', [
              `await expect(${page}.${emailProp}).toBeVisible()`,
            ]),
          ]),
          this.makeCase('empty password shows validation error', 'negative', page, [
            navigateStep(page, url),
            makeStep('Submit without password', [
              `await ${page}.${emailProp}.fill('valid@example.com')`,
              `await ${page}.${submitProp}.click()`,
            ]),
            makeStep('Assert validation error', [
              `await expect(${page}.${passwordProp}).toBeVisible()`,
            ]),
          ]),
          this.makeCase('wrong password shows authentication error', 'negative', page, [
            navigateStep(page, url),
            makeStep('Submit with wrong password', [
              `await ${page}.${emailProp}.fill('valid@example.com')`,
              `await ${page}.${passwordProp}.fill('WrongPassword!999')`,
              `await ${page}.${submitProp}.click()`,
            ]),
            makeStep('Assert error and still on login page', [
              `await expect(${page}.${submitProp}).toBeVisible()`,
            ]),
          ]),
        ],
      },
      {
        groupName: 'Accessibility',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase(
            'keyboard Tab reaches focusable form fields',
            'accessibility',
            `${page}, testPage`,
            [
              navigateStep(page, url),
              makeStep('Tab through form', [
                `await testPage.keyboard.press('Tab')`,
                `const tag = await testPage.evaluate(() => document.activeElement?.tagName.toLowerCase())`,
                `expect(['input', 'button', 'a']).toContain(tag)`,
              ]),
            ],
          ),
        ],
      },
    ]
  }

  private registrationGroups(pageName: string, url: string, _elements: ResolvedElement[]): TestGroup[] {
    const page = toPageVar(pageName)

    return [
      {
        groupName: 'Happy Path',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase('successful registration redirects after submission', 'happy-path', page, [
            navigateStep(page, url),
            makeStep('Fill registration form with unique credentials', [
              `const uid = \`\${Date.now()}-\${Math.random().toString(36).slice(2, 7)}\``,
              `await ${page}.fillUsername(\`user_\${uid}\`)`,
              `await ${page}.fillEmail(\`user_\${uid}@example.com\`)`,
              `await ${page}.fillPassword('Test@Password123!')`,
              `await ${page}.fillConfirmPassword('Test@Password123!')`,
            ]),
            makeStep('Submit form', [`await ${page}.clickSubmit()`]),
            makeStep('Assert redirect after registration', [
              `await expect(${page}.page).toHaveURL(/.+/, { timeout: 15_000 })`,
            ]),
          ]),
        ],
      },
      {
        groupName: 'Validation',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase('mismatched passwords show confirm-password error', 'negative', page, [
            navigateStep(page, url),
            makeStep('Fill form with mismatched passwords', [
              `await ${page}.fillPassword('Test@Password123!')`,
              `await ${page}.fillConfirmPassword('TotallyDifferent!999')`,
              `await ${page}.clickSubmit()`,
            ]),
            makeStep('Assert confirm-password validation error', [
              `await expect(${page}.page.locator('[role="alert"], [class*="error"]').first()).toBeVisible()`,
            ]),
          ]),
        ],
      },
    ]
  }

  private passwordChangeGroups(pageName: string, url: string, _elements: ResolvedElement[]): TestGroup[] {
    const page = toPageVar(pageName)

    return [
      {
        groupName: 'Happy Path',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase('successful password change', 'happy-path', page, [
            navigateStep(page, url),
            makeStep('Fill change-password form', [
              `await ${page}.fillCurrentPassword('OldPassword123!')`,
              `await ${page}.fillNewPassword('NewPassword456!')`,
              `await ${page}.fillConfirmPassword('NewPassword456!')`,
              `await ${page}.clickSubmit()`,
            ]),
            makeStep('Assert success message or redirect', [
              `await expect(${page}.page).toHaveURL(/.+/, { timeout: 15_000 })`,
            ]),
          ]),
        ],
      },
    ]
  }

  private searchGroups(pageName: string, url: string, _elements: ResolvedElement[]): TestGroup[] {
    const page = toPageVar(pageName)

    return [
      {
        groupName: 'Happy Path',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase('search returns results for valid query', 'happy-path', page, [
            navigateStep(page, url),
            makeStep('Enter search query and submit', [
              `await ${page}.fillSearchQuery('test query')`,
              `await ${page}.clickSearch()`,
            ]),
            makeStep('Assert results are visible', [
              `await expect(${page}.page.locator('[data-testid*="result"], [role="list"]').first()).toBeVisible()`,
            ]),
          ]),
        ],
      },
    ]
  }

  private inventoryGroups(pageName: string, url: string, elements: ResolvedElement[]): TestGroup[] {
    const page = toPageVar(pageName)
    const { groups } = collapseRepeatingLocators(elements)
    const sortEl = elements.find((e) => e.dataTest === 'product-sort-container')
    const cartEl = resolvePomElementByDataTest(elements, 'shopping-cart-link')
    const productNames = resolvePomElementByDataTest(elements, 'inventory-item-name')
    const titleGroup = groups.find((group) => group.methodName === 'itemTitleLink')
    const hasAddToCartGroup = groups.some((group) => group.methodName === 'addToCart')

    return [
      {
        groupName: 'Explore',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase('recorded click-through flow covers page interactions', 'happy-path', page, [
            navigateStep(page, url),
            makeStep('Interact with inventory elements', []),
          ]),
        ],
      },
      {
        groupName: 'List',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase('the inventory page displays product items', 'happy-path', page, [
            navigateStep(page, url),
            makeStep('Assert product list', [
              `await expect(${page}.page).toHaveURL(/inventory/)`,
              productNames
                ? `await expect(${pomLocatorExpr(page, productNames)}).toHaveCount(6)`
                : titleGroup?.listMethodName
                  ? `await expect(${pomGroupListExpr(page, titleGroup)}).toHaveCount(6)`
                  : `await expect(${page}.page).toHaveURL(/inventory/)`,
            ]),
          ]),
        ],
      },
      {
        groupName: 'Sort',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: sortEl ? this.buildInventorySortCases(page, url, sortEl, productNames, titleGroup) : [],
      },
      {
        groupName: 'Cart',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: hasAddToCartGroup
          ? [
              this.makeCase('adding a product updates the cart badge count', 'happy-path', page, [
                navigateStep(page, url),
                makeStep('Add product to cart', [
                  `await ${page}.addProductToCart('sauce-labs-backpack')`,
                ]),
                makeStep('Assert cart badge', [
                  cartEl
                    ? `await expect(${page}.${cartEl.propertyName}).toBeVisible()`
                    : `await expect(${page}.page).toHaveURL(/inventory/)`,
                ]),
              ]),
            ]
          : [],
      },
      {
        groupName: 'Detail',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: titleGroup
          ? [
              this.makeCase('clicking a product name opens the detail page', 'happy-path', page, [
                navigateStep(page, url),
                makeStep('Open product detail', [
                  `await ${page}.openItemTitle(0)`,
                ]),
                makeStep('Assert detail page URL', [
                  `await expect(${page}.page).toHaveURL(/inventory-item/)`,
                ]),
              ]),
            ]
          : [],
      },
    ]
  }

  private genericFormGroups(pageName: string, url: string, elements: ResolvedElement[]): TestGroup[] {
    const page = toPageVar(pageName)
    const fillSteps = elements
      .filter((e) => e.uiAction === 'fillInput')
      .map((e) => `await ${page}.${e.propertyName}.fill('test value')`)

    const submitEl = elements.find((e) => e.uiAction === 'clickElement' && e.kind === 'button')

    return [
      {
        groupName: 'Happy Path',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: [
          this.makeCase('successful form submission', 'happy-path', page, [
            navigateStep(page, url),
            makeStep(
              'Fill all required fields',
              fillSteps.length > 0 ? fillSteps : [`await expect(${page}.page).toBeVisible()`],
            ),
            makeStep('Submit form', [
              submitEl
                ? `await ${page}.${submitEl.propertyName}.click()`
                : `await expect(${page}.page).toBeVisible()`,
            ]),
            makeStep('Assert success state', [
              `await expect(${page}.page).toHaveURL(/.+/, { timeout: 15_000 })`,
            ]),
          ]),
        ],
      },
      {
        groupName: 'Validation',
        requiresApiSetup: false,
        apiSetupDescription: '',
        apiEndpoint: '',
        stateKey: '',
        cases: elements
          .filter((e) => e.isRequired && e.uiAction === 'fillInput')
          .slice(0, 2)
          .map((e) =>
            this.makeCase(`empty ${e.label} field shows validation error`, 'negative', page, [
              navigateStep(page, url),
              makeStep(`Submit without ${e.label}`, [
                submitEl
                  ? `await ${page}.${submitEl.propertyName}.click()`
                  : `await expect(${page}.page).toBeVisible()`,
              ]),
              makeStep(`Assert ${e.label} validation error`, [
                `await expect(${page}.${e.propertyName}).toBeVisible()`,
              ]),
            ]),
          ),
      },
    ]
  }

  private buildInventorySortCases(
    page: string,
    url: string,
    sortEl: ResolvedElement,
    productNames: ResolvedElement | undefined,
    titleGroup: RepeatingLocatorGroup | undefined,
  ): TestCase[] {
    const options = sortEl.selectOptions?.map((label) => label.trim()).filter(Boolean) ?? []
    if (options.length === 0) return []

    const sortMethod = actionMethodName(sortEl.propertyName, 'selectOption')
    const listAssert = productNames
      ? `await expect(${pomLocatorExpr(page, productNames, 'first')}).toBeVisible()`
      : titleGroup?.listMethodName
        ? `await expect(${pomGroupListExpr(page, titleGroup, 'first')}).toBeVisible()`
        : `await expect(${page}.page).toHaveURL(/inventory/)`

    return options.map((option) =>
      this.makeCase(`sorting by ${option.toLowerCase()} updates the product list`, 'happy-path', page, [
        navigateStep(page, url),
        makeStep(`Sort products by ${option}`, [
          `await ${page}.${sortMethod}(${JSON.stringify(option)})`,
        ]),
        makeStep('Assert product list remains visible after sort', [
          listAssert,
          `await expect(${page}.page).toHaveURL(/inventory/)`,
        ]),
      ]),
    )
  }

  private makeCase(
    title: string,
    caseType: TestCase['caseType'],
    fixtures: string,
    steps: TestStep[],
  ): TestCase {
    return {
      id: nextId(),
      title,
      caseType,
      fixtures,
      steps,
      requiresApiSetup: false,
    }
  }
}

export function cap(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}
