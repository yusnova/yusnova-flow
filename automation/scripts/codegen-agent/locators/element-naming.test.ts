import assert from 'node:assert/strict'
import { actionMethodName, propertyNameFromElement } from './element-naming'
import { ElementInfo } from '../types'

function el(partial: Partial<ElementInfo> & Pick<ElementInfo, 'kind' | 'tagName'>): ElementInfo {
  return {
    classes: [],
    parentPath: '',
    ancestorSelectors: [],
    isRequired: false,
    isDisabled: false,
    index: 0,
    ...partial,
  }
}

assert.equal(
  propertyNameFromElement(el({ kind: 'link', tagName: 'a', textContent: '🇸🇦العربية' })),
  'langArLink',
)
assert.equal(
  propertyNameFromElement(el({ kind: 'link', tagName: 'a', textContent: '🇷🇺Русский' })),
  'langRuLink',
)
assert.equal(
  propertyNameFromElement(el({ kind: 'link', tagName: 'a', textContent: '🇩🇪Deutsch' })),
  'deutschLink',
)
assert.equal(
  propertyNameFromElement(el({ kind: 'button', tagName: 'button', id: 'langDropBtn' })),
  'langDropdownBtn',
)
assert.equal(
  propertyNameFromElement(el({ kind: 'link', tagName: 'a', accessibleName: 'Hakkımızda', textContent: 'Hakkımızda' })),
  'hakkimizdaLink',
)
assert.equal(
  propertyNameFromElement(el({ kind: 'link', tagName: 'a', id: 'lang-tr', textContent: '🇹🇷Türkçe' })),
  'langTrLink',
)
assert.equal(actionMethodName('langArLink', 'clickElement'), 'clickLangAr')
assert.equal(actionMethodName('link', 'clickElement'), 'clickLink')

console.log('element-naming: all tests passed')
