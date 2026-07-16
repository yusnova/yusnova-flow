import { actionMethodName } from '@codegen-agent/locators/element-naming'
import { ResolvedElement } from '../types'

/** Spec assertions and actions — no inline page.locator() in generated specs. */
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

export function specClickElement(pageVar: string, el: ResolvedElement): string {
  switch (el.uiAction) {
    case 'fillInput':
      return specFillLocator(pageVar, el.propertyName, 'test value')
    case 'clickElement':
      return specClickLocator(pageVar, el.propertyName)
    default:
      return `await ${pageVar}.${actionMethodName(el.propertyName, el.uiAction)}()`
  }
}

export function specFillElement(pageVar: string, el: ResolvedElement, value: string): string {
  if (el.uiAction === 'fillInput') {
    return specFillLocator(pageVar, el.propertyName, value)
  }
  return `await ${pageVar}.${actionMethodName(el.propertyName, el.uiAction)}(${JSON.stringify(value)})`
}

export function specSelectOption(pageVar: string, el: ResolvedElement, value: string): string {
  return `await ${pageVar}.${actionMethodName(el.propertyName, el.uiAction)}(${JSON.stringify(value)})`
}
