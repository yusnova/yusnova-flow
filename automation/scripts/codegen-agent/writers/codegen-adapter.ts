import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { CodegenAction, ResolvedElement } from '../types'
import {
  specClickLinkByName,
  specClickLocator,
  specFillLocator,
  specSelectLocator,
} from './spec-pom-lines'
import {
  collapseRepeatingLocators,
  findRepeatingGroupForDataTest,
  pomGroupMemberExpr,
  RepeatingLocatorGroup,
} from '@codegen-agent/locators/repeating-locators'
import { gotoPathFromUrl } from '@codegen-agent/utils/url-utils'

const QUOTED_ARG = String.raw`(['"])(.*?)\1`

const REMOVE_PATTERNS: RegExp[] = [
  /page\.waitForTimeout\(/,
  /page\.waitForNavigation\(/,
]

const SKIP_LINE_PATTERNS: RegExp[] = [
  /^import\s+/,
  /^const\s+/,
  /^test\s*\(/,
  /^\}\);?\s*$/,
]

type TransformRule = {
  pattern: RegExp
  transform: (
    match: RegExpMatchArray,
    singles: ResolvedElement[],
    groups: RepeatingLocatorGroup[],
    pageVar: string,
  ) => string | null
}

export class CodegenAdapter {
  static readonly DEFAULT_OUTPUT = 'tmp/codegen-raw.ts'

  async run(opts: {
    url: string
    elements: ResolvedElement[]
    codegenFile?: string
    attemptCodegen: boolean
    pageVar: string
  }): Promise<CodegenAction[]> {
    const filePath = opts.codegenFile ?? CodegenAdapter.DEFAULT_OUTPUT

    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      return this.transform(raw, opts.elements, opts.pageVar)
    }

    if (opts.attemptCodegen) {
      const raw = this.invokeCodegen(opts.url, filePath)
      if (raw) return this.transform(raw, opts.elements, opts.pageVar)
    }

    return []
  }

  transform(raw: string, elements: ResolvedElement[], pageVar: string): CodegenAction[] {
    const { singles, groups } = collapseRepeatingLocators(elements)
    const lines = raw.split('\n')
    const actions: CodegenAction[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || SKIP_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) continue

      if (REMOVE_PATTERNS.some((p) => p.test(trimmed))) {
        actions.push({ original: trimmed, transformed: '', isRemoved: true })
        continue
      }

      const transformed = this.applyRules(trimmed, singles, groups, pageVar)
      actions.push({
        original: trimmed,
        transformed: transformed ?? trimmed,
        isRemoved: transformed === null,
      })
    }

    return actions
  }

  private invokeCodegen(url: string, outputPath: string): string | null {
    fs.mkdirSync('tmp', { recursive: true })
    const result = spawnSync(
      'npx',
      ['playwright', 'codegen', '--target', 'javascript', '--output', outputPath, url],
      { encoding: 'utf-8', timeout: 30_000 },
    )

    if (result.status !== 0 || !fs.existsSync(outputPath)) return null
    return fs.readFileSync(outputPath, 'utf-8')
  }

  private applyRules(
    line: string,
    singles: ResolvedElement[],
    groups: RepeatingLocatorGroup[],
    pageVar: string,
  ): string | null {
    for (const rule of this.rules) {
      const match = line.match(rule.pattern)
      if (match) return rule.transform(match, singles, groups, pageVar)
    }

    return this.transformUnresolvedLine(line, singles, groups, pageVar)
  }

  private transformUnresolvedLine(
    line: string,
    singles: ResolvedElement[],
    groups: RepeatingLocatorGroup[],
    pageVar: string,
  ): string | null {
    const locatorClick = line.match(/^await page\.locator\((['"])((?:\\.|(?!\1).)*)\1\)\.click\(\);?$/)
    if (locatorClick) {
      const selector = this.unquoteSelector(locatorClick[2] ?? '')
      const mapped = this.mapSelectorToPomClick(selector, singles, pageVar, groups)
      if (mapped) return mapped
      // Drop unmapped explore clicks instead of emitting clickBySelector.
      return null
    }

    return line
      .replace(/pageObject/g, pageVar)
      .replace(/\bpage\.goBack\(\)/g, `${pageVar}.goBack()`)
      .replace(/\bpage\./g, `${pageVar}.page.`)
  }

  private unquoteSelector(raw: string): string {
    return raw.replace(/\\"/g, '"').replace(/\\'/g, "'")
  }

  private specClickForElement(pageVar: string, el: ResolvedElement): string {
    if (el.kind === 'link') {
      const name = el.accessibleName ?? el.textContent?.trim()
      if (name) return specClickLinkByName(pageVar, name)
    }
    return specClickLocator(pageVar, el.propertyName)
  }

  private mapSelectorToPomClick(
    selector: string,
    singles: ResolvedElement[],
    pageVar: string,
  ): string | null {
    const el = singles.find((entry) => entry.locator.selector === selector)
    if (el) return this.specClickForElement(pageVar, el)

    const testId =
      selector.match(/\[data-testid=["']([^"']+)["']\]/)?.[1]
      ?? selector.match(/\[data-test=["']([^"']+)["']\]/)?.[1]
    if (testId) {
      const byTestId = singles.find(
        (entry) =>
          entry.dataTest === testId
          || entry.dataTestId === testId
          || entry.locator.selector.includes(testId),
      )
      if (byTestId) return this.specClickForElement(pageVar, byTestId)
      // Unmapped explore residue — drop rather than emit clickBySelector noise.
      return null
    }

    const roleLink = selector.match(/^role=link\[name="(.+)"\]$/)
    if (roleLink) {
      return specClickLinkByName(pageVar, roleLink[1]!)
    }

    if (selector === 'a' || selector === 'nav a') {
      const nav = singles.find((entry) => entry.locator.selector === selector || entry.propertyName === 'navLink')
      if (nav) return this.specClickForElement(pageVar, nav)
    }

    return null
  }

  private mapSelectorToPomClick(
    selector: string,
    singles: ResolvedElement[],
    pageVar: string,
    groups: RepeatingLocatorGroup[] = [],
  ): string | null {
    const el = singles.find((entry) => entry.locator.selector === selector)
    if (el) return this.specClickForElement(pageVar, el)

    const testId =
      selector.match(/\[data-testid=["']([^"']+)["']\]/)?.[1]
      ?? selector.match(/\[data-test=["']([^"']+)["']\]/)?.[1]
    if (testId) {
      const repeating = findRepeatingGroupForDataTest(groups, testId)
      if (repeating) {
        return `await ${pageVar}.click(${pomGroupMemberExpr(pageVar, repeating.group, repeating.arg)})`
      }
      const byTestId = singles.find(
        (entry) =>
          entry.dataTest === testId
          || entry.dataTestId === testId
          || entry.locator.selector.includes(testId),
      )
      if (byTestId) return this.specClickForElement(pageVar, byTestId)
      // Unmapped explore residue — drop rather than emit clickBySelector noise.
      return null
    }

    const roleLink = selector.match(/^role=link\[name="(.+)"\]$/)
    if (roleLink) {
      return specClickLinkByName(pageVar, roleLink[1]!)
    }

    if (selector === 'a' || selector === 'nav a') {
      const nav = singles.find((entry) => entry.locator.selector === selector || entry.propertyName === 'navLink')
      if (nav) return this.specClickForElement(pageVar, nav)
    }

    return null
  }

  private transformDataTestAction(
    dataTest: string,
    singles: ResolvedElement[],
    groups: RepeatingLocatorGroup[],
    pageVar: string,
    action: 'click' | 'selectOption',
    actionArgs = '',
  ): string {
    const repeating = findRepeatingGroupForDataTest(groups, dataTest)
    if (repeating) {
      const locator = pomGroupMemberExpr(pageVar, repeating.group, repeating.arg)
      if (action === 'selectOption') {
        const value = actionArgs.replace(/^['"]|['"]$/g, '')
        return specSelectLocator(pageVar, locator, value)
      }
      return `await ${pageVar}.click(${locator})`
    }

    const el = singles.find((entry) => entry.dataTest === dataTest || entry.dataTestId === dataTest)
    if (!el) {
      // Unmapped data-test from explore — drop rather than clickBySelector.
      return null
    }

    if (action === 'selectOption') {
      const value = actionArgs.replace(/^['"]|['"]$/g, '')
      return specSelectLocator(pageVar, `${pageVar}.${el.propertyName}`, value)
    }
    return this.specClickForElement(pageVar, el)
  }

  private readonly rules: TransformRule[] = [
    {
      pattern: /page\.getByLabel\('([^']+)'\)\.fill\('([^']*)'\)/,
      transform: (m, singles, _groups, pageVar) => {
        const el = this.findByLabel(singles, m[1] ?? '')
        if (!el) return `await ${pageVar}.page.getByLabel('${m[1]}').fill('${m[2]}')`
        return specFillLocator(pageVar, el.propertyName, m[2] ?? '')
      },
    },
    {
      pattern: /page\.getByRole\('button',\s*\{\s*name:\s*'([^']+)'\s*\}\)\.click\(\)/,
      transform: (m, singles, _groups, pageVar) => {
        const el = this.findByText(singles, m[1] ?? '')
        if (!el) return `await ${pageVar}.clickByRole('${m[1]}')`
        return this.specClickForElement(pageVar, el)
      },
    },
    {
      pattern: /page\.getByPlaceholder\('([^']+)'\)\.fill\('([^']*)'\)/,
      transform: (m, singles, _groups, pageVar) => {
        const el = singles.find((e) => e.placeholder === m[1])
        if (!el) return `await ${pageVar}.page.getByPlaceholder('${m[1]}').fill('${m[2]}')`
        return specFillLocator(pageVar, el.propertyName, m[2] ?? '')
      },
    },
    {
      pattern: /page\.locator\('text=([^']+)'\)\.click\(\)/,
      transform: (m, singles, _groups, pageVar) => {
        const el = this.findByText(singles, m[1] ?? '')
        if (!el) return `await ${pageVar}.clickByText('${m[1]}')`
        return this.specClickForElement(pageVar, el)
      },
    },
    {
      pattern: /page\.goto\(([^)]+)\)/,
      transform: (m, _singles, _groups, pageVar) => {
        const raw = (m[1] ?? '').trim()
        const quoted = raw.match(/^['"](.+)['"]$/)
        const path = gotoPathFromUrl(quoted?.[1] ?? raw)
        return `await ${pageVar}.page.goto(${JSON.stringify(path)})`
      },
    },
    {
      pattern: /page\.locator\("\[data-test=\\"([^"]+)\\"\]"\)\.click\(\)/,
      transform: (m, singles, groups, pageVar) =>
        this.transformDataTestAction(m[1] ?? '', singles, groups, pageVar, 'click'),
    },
    {
      pattern: new RegExp(String.raw`page\.locator\("\[data-test=\\"([^"]+)\\"\]"\)\.selectOption\(${QUOTED_ARG}\)`),
      transform: (m, singles, groups, pageVar) =>
        this.transformDataTestAction(m[1] ?? '', singles, groups, pageVar, 'selectOption', `${m[2]}${m[3]}${m[2]}`),
    },
    {
      pattern: /page\.locator\((['"])\[data-test=\\?"([^"\\]+)\\?"\]\1\)\.click\(\)/,
      transform: (m, singles, groups, pageVar) =>
        this.transformDataTestAction(m[2] ?? '', singles, groups, pageVar, 'click'),
    },
    {
      pattern: new RegExp(String.raw`page\.locator\((['"])\[data-test=\\?"([^"\\]+)\\?"\]\1\)\.selectOption\(${QUOTED_ARG}\)`),
      transform: (m, singles, groups, pageVar) =>
        this.transformDataTestAction(m[2] ?? '', singles, groups, pageVar, 'selectOption', `${m[3]}${m[4]}${m[3]}`),
    },
    {
      pattern: /page\.locator\('(\[data-test="[^"]+"\])'\)\.click\(\)/,
      transform: (m, singles, groups, pageVar) => {
        const dataTest = m[1]?.match(/\[data-test="([^"]+)"\]/)?.[1] ?? ''
        return this.transformDataTestAction(dataTest, singles, groups, pageVar, 'click')
      },
    },
    {
      pattern: new RegExp(String.raw`page\.locator\('(\[data-test="[^"]+"\])'\)\.selectOption\(${QUOTED_ARG}\)`),
      transform: (m, singles, groups, pageVar) => {
        const dataTest = m[1]?.match(/\[data-test="([^"]+)"\]/)?.[1] ?? ''
        return this.transformDataTestAction(dataTest, singles, groups, pageVar, 'selectOption', `${m[2]}${m[3]}${m[2]}`)
      },
    },
    {
      pattern: /page\.locator\('(\[data-test="[^"]+"\])'\)\.first\(\)\.click\(\)/,
      transform: (m, singles, _groups, pageVar) => {
        const el = singles.find((e) => e.locator.selector === m[1])
        if (!el) return `await ${pageVar}.clickBySelector(${JSON.stringify(m[1] ?? '')})`
        return this.specClickForElement(pageVar, el)
      },
    },
    {
      pattern: /page\.goBack\(\)/,
      transform: (_m, _els, _groups, pageVar) => `await ${pageVar}.goBack()`,
    },
    {
      pattern: /page\.locator\((['"])((?:\\.|(?!\1).)*)\1\)\.click\(\)/,
      transform: (m, singles, groups, pageVar) => {
        const selector = this.unquoteSelector(m[2] ?? '')
        const dataTest = selector.match(/^\[data-test="([^"]+)"\]$/)?.[1]
        if (dataTest) {
          return this.transformDataTestAction(dataTest, singles, groups, pageVar, 'click')
        }

        const mapped = this.mapSelectorToPomClick(selector, singles, pageVar, groups)
        if (mapped) return mapped
        return `await ${pageVar}.clickBySelector(${JSON.stringify(selector)})`
      },
    },
    {
      pattern: /expect\(page\)\.toHaveURL\('([^']+)'\)/,
      transform: (m, _els, _groups, pageVar) =>
        `await expect(${pageVar}.page).toHaveURL(${JSON.stringify(m[1] ?? '')})`,
    },
  ]

  private findByLabel(els: ResolvedElement[], label: string): ResolvedElement | undefined {
    const lower = label.toLowerCase()
    return els.find(
      (e) =>
        e.ariaLabel?.toLowerCase() === lower ||
        e.placeholder?.toLowerCase() === lower ||
        e.label.toLowerCase() === lower,
    )
  }

  private findByText(els: ResolvedElement[], text: string): ResolvedElement | undefined {
    const lower = text.toLowerCase()
    return els.find((e) => e.textContent?.toLowerCase().includes(lower))
  }
}
