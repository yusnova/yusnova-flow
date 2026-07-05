import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { CodegenAction, ResolvedElement } from './types'
import { actionMethodName, groupActionMethodName } from './element-naming'
import {
  collapseRepeatingLocators,
  findRepeatingGroupForDataTest,
  RepeatingLocatorGroup,
} from './repeating-locators'
import { gotoPathFromUrl } from './url-utils'
import { cap } from './test-planner'

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

    return line.replace(/pageObject/g, pageVar).replace(/\bpage\./g, `${pageVar}.page.`)
  }

  private formatRepeatingArg(arg: string | number): string {
    return typeof arg === 'number' ? String(arg) : JSON.stringify(arg)
  }

  private transformDataTestAction(
    dataTest: string,
    singles: ResolvedElement[],
    groups: RepeatingLocatorGroup[],
    pageVar: string,
    action: 'click' | 'selectOption',
    actionArgs = '',
  ): string {
    const uiAction = action === 'selectOption' ? 'selectOption' : 'clickElement'
    const repeating = findRepeatingGroupForDataTest(groups, dataTest)
    if (repeating) {
      const arg = this.formatRepeatingArg(repeating.arg)
      const methodName = groupActionMethodName(repeating.group.methodName, uiAction)
      if (action === 'selectOption') {
        return `await ${pageVar}.${methodName}(${arg}, ${actionArgs})`
      }
      return `await ${pageVar}.${methodName}(${arg})`
    }

    const el = singles.find((entry) => entry.dataTest === dataTest)
    if (!el) {
      const selector = `[data-test="${dataTest}"]`
      if (action === 'selectOption') {
        return `await ${pageVar}.page.locator('${selector}').selectOption(${actionArgs})`
      }
      return `await ${pageVar}.page.locator('${selector}').click()`
    }

    const methodName = actionMethodName(el.propertyName, uiAction)
    if (action === 'selectOption') {
      return `await ${pageVar}.${methodName}(${actionArgs})`
    }
    return `await ${pageVar}.${methodName}()`
  }

  private readonly rules: TransformRule[] = [
    {
      pattern: /page\.getByLabel\('([^']+)'\)\.fill\('([^']*)'\)/,
      transform: (m, singles, _groups, pageVar) => {
        const el = this.findByLabel(singles, m[1] ?? '')
        if (!el) return `await ${pageVar}.page.getByLabel('${m[1]}').fill('${m[2]}')`
        return `await ${pageVar}.${actionMethodName(el.propertyName, 'fillInput')}('${m[2]}')`
      },
    },
    {
      pattern: /page\.getByRole\('button',\s*\{\s*name:\s*'([^']+)'\s*\}\)\.click\(\)/,
      transform: (m, singles, _groups, pageVar) => {
        const el = this.findByText(singles, m[1] ?? '')
        if (!el) return `await ${pageVar}.click${cap('Submit')}()`
        return `await ${pageVar}.${actionMethodName(el.propertyName, 'clickElement')}()`
      },
    },
    {
      pattern: /page\.getByPlaceholder\('([^']+)'\)\.fill\('([^']*)'\)/,
      transform: (m, singles, _groups, pageVar) => {
        const el = singles.find((e) => e.placeholder === m[1])
        if (!el) return `await ${pageVar}.fillField('${m[2]}')`
        return `await ${pageVar}.${actionMethodName(el.propertyName, 'fillInput')}('${m[2]}')`
      },
    },
    {
      pattern: /page\.locator\('text=([^']+)'\)\.click\(\)/,
      transform: (m, singles, _groups, pageVar) => {
        const el = this.findByText(singles, m[1] ?? '')
        if (!el) return `await ${pageVar}.page.getByText('${m[1]}').click()`
        return `await ${pageVar}.${actionMethodName(el.propertyName, 'clickElement')}()`
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
        if (!el) return `await ${pageVar}.page.locator('${m[1]}').first().click()`
        return `await ${pageVar}.${el.propertyName}.first().click()`
      },
    },
    {
      pattern: /page\.goBack\(\)/,
      transform: (_m, _els, pageVar) => `await ${pageVar}.page.goBack()`,
    },
    {
      pattern: /page\.locator\((['"])([^'"]+)\1\)\.click\(\)/,
      transform: (m, singles, groups, pageVar) => {
        const quote = m[1] ?? "'"
        const selector = m[2] ?? ''
        const dataTest = selector.match(/^\[data-test="([^"]+)"\]$/)?.[1]
        if (dataTest) {
          return this.transformDataTestAction(dataTest, singles, groups, pageVar, 'click')
        }

        const el = singles.find((entry) => entry.locator.selector === selector)
        if (!el) {
          return `await ${pageVar}.page.locator(${quote}${selector}${quote}).click()`
        }
        return `await ${pageVar}.${actionMethodName(el.propertyName, 'clickElement')}()`
      },
    },
    {
      pattern: /expect\(page\)\.toHaveURL\('([^']+)'\)/,
      transform: (m, _els, pageVar) =>
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
