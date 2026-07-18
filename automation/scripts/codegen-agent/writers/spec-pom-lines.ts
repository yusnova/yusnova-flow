import { ResolvedElement } from '../types'
import {
  findRepeatingGroupForDataTest,
  pomGroupMemberExpr,
  type RepeatingLocatorGroup,
} from '@codegen-agent/locators/repeating-locators'
import { collapseRepeatingLocators } from '@codegen-agent/locators/repeating-locators'

/** Spec assertions and actions — locator-first via BasePage primitives. */

export function specExpectPageLoaded(pageVar: string): string {
  return `await ${pageVar}.expectPageLoaded()`
}

export function specExpectValidationError(pageVar: string): string {
  return `await ${pageVar}.expectValidationError()`
}

export function specExpectSearchResults(pageVar: string): string {
  return `await ${pageVar}.expectSearchResults()`
}

export function specClickLocator(pageVar: string, propertyName: string): string {
  return `await ${pageVar}.click(${pageVar}.${propertyName})`
}

export function specFillLocator(pageVar: string, propertyName: string, value: string): string {
  return `await ${pageVar}.fill(${pageVar}.${propertyName}, ${JSON.stringify(value)})`
}

export function specCheckLocator(pageVar: string, locatorExpr: string): string {
  return `await ${pageVar}.check(${locatorExpr})`
}

export function specUncheckLocator(pageVar: string, locatorExpr: string): string {
  return `await ${pageVar}.uncheck(${locatorExpr})`
}

export function specSelectLocator(pageVar: string, locatorExpr: string, value: string): string {
  return `await ${pageVar}.select(${locatorExpr}, ${JSON.stringify(value)})`
}

export function specSetFilesLocator(pageVar: string, locatorExpr: string, filePath: string): string {
  return `await ${pageVar}.setFiles(${locatorExpr}, ${JSON.stringify(filePath)})`
}

export function specClickLinkByName(pageVar: string, linkName: string): string {
  return `await ${pageVar}.clickLinkByName(${JSON.stringify(linkName)})`
}

export function specCaptureText(pageVar: string, varName: string, propertyName?: string): string {
  const arg = propertyName ? `${pageVar}.${propertyName}` : ''
  return `const ${varName} = await ${pageVar}.captureText(${arg})`
}

export function specExpectContentChanged(pageVar: string, varName: string, propertyName?: string): string {
  const arg = propertyName ? `${varName}, ${pageVar}.${propertyName}` : varName
  return `await ${pageVar}.expectContentChanged(${arg})`
}

function locatorExprForElement(
  pageVar: string,
  el: ResolvedElement,
  groups?: RepeatingLocatorGroup[],
): string {
  const dataTest = el.dataTest ?? el.dataTestId ?? el.dataTestIdHyphen
  if (dataTest && groups?.length) {
    const hit = findRepeatingGroupForDataTest(groups, dataTest)
    if (hit) return pomGroupMemberExpr(pageVar, hit.group, hit.arg)
  }
  return `${pageVar}.${el.propertyName}`
}

/** Resolve groups once when emitting many lines for the same page. */
export function groupsForElements(elements: ResolvedElement[]): RepeatingLocatorGroup[] {
  return collapseRepeatingLocators(elements).groups
}

export function specClickElement(
  pageVar: string,
  el: ResolvedElement,
  groups?: RepeatingLocatorGroup[],
): string {
  const locator = locatorExprForElement(pageVar, el, groups)
  switch (el.uiAction) {
    case 'fillInput':
      return `await ${pageVar}.fill(${locator}, "test value")`
    case 'checkCheckbox':
      return specCheckLocator(pageVar, locator)
    case 'selectOption':
      return specSelectLocator(pageVar, locator, 'test value')
    case 'uploadFile':
      return specSetFilesLocator(pageVar, locator, 'test-file.txt')
    case 'clickElement':
    default:
      return `await ${pageVar}.click(${locator})`
  }
}

export function specFillElement(
  pageVar: string,
  el: ResolvedElement,
  value: string,
  groups?: RepeatingLocatorGroup[],
): string {
  const locator = locatorExprForElement(pageVar, el, groups)
  if (el.uiAction === 'selectOption') {
    return specSelectLocator(pageVar, locator, value)
  }
  if (el.uiAction === 'uploadFile') {
    return specSetFilesLocator(pageVar, locator, value)
  }
  return `await ${pageVar}.fill(${locator}, ${JSON.stringify(value)})`
}

export function specSelectOption(
  pageVar: string,
  el: ResolvedElement,
  value: string,
  groups?: RepeatingLocatorGroup[],
): string {
  return specSelectLocator(pageVar, locatorExprForElement(pageVar, el, groups), value)
}
