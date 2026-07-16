import { collapseRepeatingLocators, RepeatingLocatorGroup } from '@codegen-agent/locators/repeating-locators'
import { ResolvedElement } from '../types'

export type PomLocatorModifier = 'first' | 'nth'

export function resolvePomElement(
  elements: ResolvedElement[],
  matcher: (el: ResolvedElement) => boolean,
): ResolvedElement | undefined {
  const { singles } = collapseRepeatingLocators(elements)
  return singles.find(matcher)
}

export function resolvePomElementByDataTest(
  elements: ResolvedElement[],
  dataTest: string,
): ResolvedElement | undefined {
  return resolvePomElement(elements, (el) => el.dataTest === dataTest)
}

export function pomLocatorExpr(
  pageVar: string,
  el: ResolvedElement,
  modifier?: PomLocatorModifier,
  nth = 0,
): string {
  let expr = `${pageVar}.${el.propertyName}`
  if (modifier === 'first') expr += '.first()'
  if (modifier === 'nth') expr += `.nth(${nth})`
  return expr
}

export function pomGroupListExpr(
  pageVar: string,
  group: RepeatingLocatorGroup,
  modifier?: PomLocatorModifier,
): string {
  let expr = `${pageVar}.${group.listMethodName!}()`
  if (modifier === 'first') expr += '.first()'
  return expr
}
