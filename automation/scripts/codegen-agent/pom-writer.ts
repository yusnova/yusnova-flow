import * as fs from 'node:fs'
import * as path from 'node:path'
import Handlebars from 'handlebars'
import { POM_TEMPLATE } from './templates/pom.template'
import { actionMethodName, groupActionMethodName } from './element-naming'
import { collapseRepeatingLocators, RepeatingLocatorGroup } from './repeating-locators'
import { toPageFileName } from './page-name'
import { PagePattern, PomLocatorMethod, PomMethod, PomMethodStep, PomTemplateData, ResolvedElement } from './types'

const hbs = Handlebars.create()

export class PomWriter {
  async write(opts: {
    pageName: string
    domain: string
    url: string
    elements: ResolvedElement[]
    pattern: PagePattern
    automationRoot: string
    overwrite: boolean
  }): Promise<string> {
    const fileName = toPageFileName(opts.pageName)
    const outPath = path.join(opts.automationRoot, 'pages', fileName)

    if (fs.existsSync(outPath) && !opts.overwrite) {
      throw new Error(`POM already exists: ${outPath} (use --overwrite to replace)`)
    }

    const { singles, groups } = collapseRepeatingLocators(opts.elements)
    const pomSingles = singles.filter(isPomCandidate)

    const data: PomTemplateData = {
      pageName: opts.pageName,
      domain: opts.domain,
      fileName,
      locators: pomSingles.map((e) => ({
        propertyName: e.propertyName,
        selector: e.locator.selector,
      })),
      locatorMethods: buildLocatorMethods(groups),
      methods: this.buildMethods(opts.pattern, pomSingles, groups),
    }

    const compiled = hbs.compile(POM_TEMPLATE)
    const content = cleanWhitespace(compiled(data))

    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, content, 'utf-8')
    return outPath
  }

  private buildMethods(
    pattern: PagePattern,
    singles: ResolvedElement[],
    groups: RepeatingLocatorGroup[],
  ): PomMethod[] {
    if (pattern === 'login') {
      const login = buildLoginMethod(singles)
      if (login) return [login]
    }

    const methods: PomMethod[] = []

    if (pattern === 'inventory') {
      methods.push({
        name: 'goto',
        params: '',
        steps: [{ line: `await this.page.goto('/inventory.html')` }],
      })
    }

    for (const el of singles) {
      methods.push(...buildActionMethodsForElement(el))
    }

    for (const group of groups) {
      methods.push(...buildActionMethodsForGroup(group))
    }

    const fillables = singles.filter((e) => e.uiAction === 'fillInput')
    const submitEl = singles.find((e) => e.uiAction === 'clickElement' && e.kind === 'button')

    if (fillables.length >= 2 && submitEl) {
      const compositeSteps: PomMethodStep[] = fillables.map((e) =>
        interactionStep(
          'fillInput',
          e.propertyName,
          e.propertyName.replace(/Input$/, '').replace(/Textarea$/, ''),
        ),
      )
      compositeSteps.push(interactionStep('clickElement', submitEl.propertyName, ''))

      const params = fillables
        .map((e) => `${e.propertyName.replace(/Input$/, '').replace(/Textarea$/, '')}: string`)
        .join(', ')

      methods.push({ name: 'submitForm', params, steps: compositeSteps })
    }

    return methods
  }
}

function buildLocatorMethods(groups: RepeatingLocatorGroup[]): PomLocatorMethod[] {
  const indexed = groups.map((group) => ({
    name: group.methodName,
    params: `${group.paramName}: ${group.paramType}`,
    body: `return this.page.locator(\`${group.selectorTemplate}\`)`,
  }))

  const lists = groups
    .filter((group) => group.listMethodName && group.listSelector)
    .map((group) => ({
      name: group.listMethodName!,
      params: '',
      body: `return this.page.locator('${group.listSelector}')`,
    }))

  return [...indexed, ...lists]
}

function buildActionMethodsForElement(el: ResolvedElement): PomMethod[] {
  const name = actionMethodName(el.propertyName, el.uiAction)

  if (el.uiAction === 'fillInput') {
    return [{
      name,
      params: 'value: string',
      steps: [interactionStep(el.uiAction, el.propertyName, 'value')],
    }]
  }

  if (el.uiAction === 'checkCheckbox') {
    return [{
      name,
      params: 'check: boolean',
      steps: [interactionStep(el.uiAction, el.propertyName, 'check')],
    }]
  }

  if (el.uiAction === 'selectOption') {
    return [{
      name,
      params: 'value: string',
      steps: [interactionStep(el.uiAction, el.propertyName, 'value')],
    }]
  }

  if (el.uiAction === 'uploadFile') {
    return [{
      name,
      params: 'filePath: string',
      steps: [interactionStep(el.uiAction, el.propertyName, 'filePath')],
    }]
  }

  if (el.uiAction === 'clickElement') {
    return [{
      name,
      params: '',
      steps: [interactionStep(el.uiAction, el.propertyName, '')],
    }]
  }

  return []
}

function buildActionMethodsForGroup(group: RepeatingLocatorGroup): PomMethod[] {
  const name = groupActionMethodName(group.methodName, group.uiAction)
  const param = `${group.paramName}: ${group.paramType}`

  switch (group.uiAction) {
    case 'fillInput':
      return [{
        name,
        params: `${param}, value: string`,
        steps: [{ line: `await this.${group.methodName}(${group.paramName}).fill(value)` }],
      }]
    case 'selectOption':
      return [{
        name,
        params: `${param}, value: string`,
        steps: [{ line: `await this.${group.methodName}(${group.paramName}).selectOption(value)` }],
      }]
    case 'checkCheckbox':
      return [{
        name,
        params: `${param}, check: boolean`,
        steps: [{
          line: `if (check) { await this.${group.methodName}(${group.paramName}).check() } else { await this.${group.methodName}(${group.paramName}).uncheck() }`,
        }],
      }]
    case 'uploadFile':
      return [{
        name,
        params: `${param}, filePath: string`,
        steps: [{ line: `await this.${group.methodName}(${group.paramName}).setInputFiles(filePath)` }],
      }]
    default:
      return [{
        name,
        params: param,
        steps: [{ line: `await this.${group.methodName}(${group.paramName}).click()` }],
      }]
  }
}

function cleanWhitespace(raw: string): string {
  return raw.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function isPomCandidate(el: ResolvedElement): boolean {
  if (el.kind !== 'unknown') return true
  if (!el.dataTest) return false
  if (el.dataTest === 'inventory-item-name') return true
  return !isStructuralDataTest(el.dataTest)
}

function isStructuralDataTest(dataTest: string): boolean {
  if (/(-container|-list|-header|-copy|-description|-desc|-price|-img)$/.test(dataTest)) return true
  if (['inventory', 'title', 'active-option', 'footer', 'header', 'inventory-item'].includes(dataTest)) {
    return true
  }
  if (dataTest.startsWith('inventory-item-')) return true
  return false
}

function buildLoginMethod(elements: ResolvedElement[]): PomMethod | null {
  const emailEl = elements.find((e) => e.kind === 'input-email' || e.kind === 'input-text')
  const passwordEl = elements.find((e) => e.kind === 'input-password')
  const submitEl = elements.find((e) => e.kind === 'button')

  if (!emailEl || !passwordEl || !submitEl) return null

  const emailParam = emailEl.propertyName.replace(/Input$/, '')
  const passwordParam = passwordEl.propertyName.replace(/Input$/, '')

  return {
    name: 'login',
    params: `${emailParam}: string, ${passwordParam}: string`,
    steps: [
      { line: `await this.${emailEl.propertyName}.fill(${emailParam})` },
      { line: `await this.${passwordEl.propertyName}.fill(${passwordParam})` },
      { line: `await this.${submitEl.propertyName}.click()` },
    ],
  }
}

function interactionStep(
  uiAction: ResolvedElement['uiAction'],
  target: string,
  value: string,
): PomMethodStep {
  switch (uiAction) {
    case 'fillInput':
      return { line: `await this.${target}.fill(${value})` }
    case 'clickElement':
      return { line: `await this.${target}.click()` }
    case 'checkCheckbox':
      return {
        line: `if (${value}) { await this.${target}.check() } else { await this.${target}.uncheck() }`,
      }
    case 'selectOption':
      return { line: `await this.${target}.selectOption(${value})` }
    case 'uploadFile':
      return { line: `await this.${target}.setInputFiles(${value})` }
    default:
      return { line: '' }
  }
}
