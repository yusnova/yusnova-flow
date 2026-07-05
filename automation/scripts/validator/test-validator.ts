#!/usr/bin/env ts-node
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as ts from 'typescript'
import { Command } from 'commander'

interface ValidatorOptions {
  automationRoot: string
  domain?: string
  browser: boolean
  baseUrl?: string
}

interface Violation {
  file: string
  rule: string
  message: string
  line?: number
}

interface SelectorInfo {
  selector: string
  line: number
}

const BANNED_SPEC_PATTERNS: Array<{ rule: string; pattern: RegExp; message: string }> = [
  { rule: 'no-waitForTimeout', pattern: /waitForTimeout\s*\(/, message: 'waitForTimeout is banned' },
  { rule: 'no-page-import', pattern: /import\s+\{[^}]*\bPage\b[^}]*\}\s+from\s+['"]@playwright\/test['"]/, message: 'Do not import Page in spec files' },
  { rule: 'no-direct-playwright-test', pattern: /import\s+\{[^}]*\btest\b[^}]*\}\s+from\s+['"]@playwright\/test['"]/, message: 'Import test from domain fixture' },
  { rule: 'no-getByLabel-in-spec', pattern: /\.getByLabel\s*\(/, message: 'Use POM locators instead of getByLabel in specs' },
  { rule: 'no-getByRole-in-spec', pattern: /\.getByRole\s*\(/, message: 'Use POM locators instead of getByRole in specs' },
]

const BANNED_POM_PATTERNS: Array<{ rule: string; pattern: RegExp; message: string }> = [
  { rule: 'no-getByLabel', pattern: /\.getByLabel\s*\(/, message: 'getByLabel is banned in POMs' },
  { rule: 'no-getByRole', pattern: /\.getByRole\s*\(/, message: 'getByRole is banned in POMs' },
  { rule: 'no-nth-child', pattern: /nth-child|nth-of-type/, message: 'nth-child/nth-of-type selectors are banned' },
  { rule: 'no-generated-classes', pattern: /css-|sc-|chakra-/, message: 'Generated CSS class selectors are banned' },
]

const TEST_TITLE_PATTERN = /^\[[A-Za-z0-9]+\]\s+\|\s+verify that\s+.+$/

async function main(): Promise<void> {
  const program = new Command()
  program
    .name('test-validator')
    .description('Validate automation framework conventions')
    .option('--domain <domain>', 'Limit validation to one domain')
    .option('--browser', 'Open browser to verify selectors', false)
    .option('--base-url <url>', 'Base URL for browser selector checks')

  program.parse(process.argv)
  const raw = program.opts<{ domain?: string; browser: boolean; baseUrl?: string }>()

  const opts: ValidatorOptions = {
    automationRoot: path.resolve(__dirname, '..', '..'),
    browser: raw.browser,
    ...(raw.domain ? { domain: raw.domain } : {}),
    ...(raw.baseUrl ? { baseUrl: raw.baseUrl } : {}),
  }

  const { specFiles, pomFiles } = discoverFiles(opts)
  const violations: Violation[] = []

  for (const file of specFiles) {
    violations.push(...validateSpecFile(file))
  }

  for (const file of pomFiles) {
    violations.push(...validatePomFile(file))
  }

  if (opts.browser && opts.baseUrl) {
    violations.push(...(await validateSelectorsInBrowser(pomFiles, opts.baseUrl)))
  } else if (opts.browser) {
    console.warn('⚠  --browser requires --base-url; skipping browser checks.')
  }

  printReport(violations, specFiles.length, pomFiles.length)

  if (violations.length > 0) process.exit(1)
}

function discoverFiles(opts: ValidatorOptions): { specFiles: string[]; pomFiles: string[] } {
  const suitesRoot = path.join(opts.automationRoot, 'suites')
  const pagesRoot = path.join(opts.automationRoot, 'pages')

  const suiteDirs = opts.domain
    ? [path.join(suitesRoot, opts.domain)]
    : fs
        .readdirSync(suitesRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(suitesRoot, e.name))

  const specFiles: string[] = []
  for (const dir of suiteDirs) {
    if (fs.existsSync(dir)) specFiles.push(...findFiles(dir, '.spec.ts'))
  }

  const pomFiles = fs.existsSync(pagesRoot) ? findFiles(pagesRoot, '.ts') : []
  return { specFiles, pomFiles }
}

function findFiles(dir: string, suffix: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...findFiles(full, suffix))
    if (entry.isFile() && entry.name.endsWith(suffix)) results.push(full)
  }
  return results
}

function validateSpecFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const source = parseSource(content, filePath)
  const violations: Violation[] = []

  if (!content.includes('test.describe(')) {
    violations.push({ file: filePath, rule: 'require-describe', message: 'Spec must contain test.describe()' })
  }

  for (const { rule, pattern, message } of BANNED_SPEC_PATTERNS) {
    if (pattern.test(content)) violations.push({ file: filePath, rule, message })
  }

  const hasExpect = /expect\s*\(/.test(content)
  if (!hasExpect) {
    violations.push({ file: filePath, rule: 'require-expect', message: 'Spec must contain at least one expect() assertion' })
  }

  visitNodes(source, (node) => {
    if (!ts.isCallExpression(node)) return
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'test') return
    if (node.arguments.length === 0) return

    const titleArg = node.arguments[0]
    if (titleArg === undefined) return
    if (!ts.isStringLiteral(titleArg) && !ts.isNoSubstitutionTemplateLiteral(titleArg)) return

    const title = titleArg.text
    if (!TEST_TITLE_PATTERN.test(title)) {
      violations.push({
        file: filePath,
        rule: 'test-title-format',
        message: `Test title must match "[Name] | verify that ...": "${title}"`,
        line: source.getLineAndCharacterOfPosition(titleArg.getStart()).line + 1,
      })
    }

    const body = node.arguments[node.arguments.length - 1]
    if (body === undefined || !ts.isFunctionLike(body)) return
    if (!body.body || !ts.isBlock(body.body)) return

    const hasStep = containsTestStep(body.body)
    if (!hasStep) {
      violations.push({
        file: filePath,
        rule: 'require-test-step',
        message: `Test "${title}" must wrap phases in test.step()`,
        line: source.getLineAndCharacterOfPosition(body.getStart()).line + 1,
      })
    }
  })

  return violations
}

function validatePomFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const violations: Violation[] = []

  if (path.basename(filePath) === 'base-page.ts') return violations

  if (!/extends\s+BasePage/.test(content)) {
    violations.push({ file: filePath, rule: 'pom-extends-base', message: 'POM must extend BasePage' })
  }

  for (const { rule, pattern, message } of BANNED_POM_PATTERNS) {
    if (pattern.test(content)) violations.push({ file: filePath, rule, message })
  }

  const selectors = extractLocators(content)
  if (selectors.length === 0) {
    violations.push({ file: filePath, rule: 'pom-has-locators', message: 'POM should declare page.locator() calls' })
  }

  return violations
}

function extractLocators(content: string): SelectorInfo[] {
  const selectors: SelectorInfo[] = []
  const re = /\blocator\(\s*(['"`])([\s\S]*?)\1\s*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const line = content.slice(0, match.index).split('\n').length
    selectors.push({ selector: match[2] ?? '', line })
  }
  return selectors
}

async function validateSelectorsInBrowser(pomFiles: string[], baseUrl: string): Promise<Violation[]> {
  const { chromium } = await import('@playwright/test')
  const violations: Violation[] = []
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    for (const file of pomFiles) {
      if (path.basename(file) === 'base-page.ts') continue
      for (const { selector, line } of extractLocators(fs.readFileSync(file, 'utf-8'))) {
        const count = await page.locator(selector).count()
        if (count === 0) {
          violations.push({
            file,
            rule: 'selector-not-found',
            message: `Selector not found on page: ${selector}`,
            line,
          })
        }
      }
    }
  } finally {
    await browser.close()
  }

  return violations
}

function parseSource(content: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true)
}

function visitNodes(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node)
  ts.forEachChild(node, (child) => visitNodes(child, visitor))
}

function containsTestStep(body: ts.Block): boolean {
  let found = false
  visitNodes(body, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'step' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'test'
    ) {
      found = true
    }
  })
  return found
}

function printReport(violations: Violation[], specCount: number, pomCount: number): void {
  console.log(`\nValidated ${specCount} spec file(s) and ${pomCount} POM file(s).\n`)

  if (violations.length === 0) {
    console.log('\x1b[32m✓ All checks passed.\x1b[0m\n')
    return
  }

  console.log(`\x1b[31m✗ ${violations.length} violation(s) found:\x1b[0m\n`)
  for (const v of violations) {
    const loc = v.line ? `:${v.line}` : ''
    console.log(`  [${v.rule}] ${path.relative(process.cwd(), v.file)}${loc}`)
    console.log(`         ${v.message}`)
  }
  console.log()
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`Fatal: ${message}`)
  process.exit(1)
})
