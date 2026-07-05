import { ElementInfo, ElementKind, UiAction } from './types'

const MAX_TEXT_WORDS = 4

export function labelFromElement(el: ElementInfo): string {
  if (el.ariaLabel) return el.ariaLabel
  if (el.placeholder) return el.placeholder
  if (el.textContent) return el.textContent.slice(0, 40)
  if (el.name) return el.name.replace(/_/g, ' ')
  if (el.id) return el.id.replace(/-/g, ' ')
  if (el.dataTest) return el.dataTest.replace(/-/g, ' ')

  const kindLabels: Record<ElementKind, string> = {
    'input-text': 'text input',
    'input-email': 'email input',
    'input-password': 'password input',
    'input-number': 'number input',
    'input-checkbox': 'checkbox',
    'input-radio': 'radio',
    'input-file': 'file input',
    button: 'button',
    select: 'select dropdown',
    textarea: 'textarea',
    link: 'link',
    unknown: 'element',
  }

  return kindLabels[el.kind] ?? 'element'
}

export function propertyNameFromElement(el: ElementInfo): string {
  if (el.dataTest) return finalizePropertyName(nameFromDataTest(el.dataTest), el.kind)
  if (el.dataTestId) return finalizePropertyName(nameFromDataTest(el.dataTestId), el.kind)

  if (el.kind === 'select') {
    if (el.name) return finalizePropertyName(wordsToCamel(el.name), el.kind)
    if (el.id) return finalizePropertyName(wordsToCamel(el.id), el.kind)
    return 'dropdownSelect'
  }

  const raw =
    el.ariaLabel ??
    el.placeholder ??
    el.name ??
    el.id ??
    truncateText(el.textContent) ??
    el.kind

  return finalizePropertyName(wordsToCamel(raw), el.kind)
}

export function nameFromDataTest(dataTest: string): string {
  let stem = dataTest
    .replace(/^add-to-cart-/, 'add-to-cart')
    .replace(/-container$/, '')
    .replace(/-link$/, '')
    .replace(/-btn$/, '')

  return wordsToCamel(stem)
}

export function actionMethodName(propertyName: string, uiAction: UiAction | string): string {
  switch (uiAction) {
    case 'fillInput':
      return stripSuffix(propertyName, 'Input', 'fill')
    case 'selectOption':
      return stripSuffix(propertyName, 'Select', 'select')
    case 'checkCheckbox':
      return stripSuffix(propertyName, 'Checkbox', 'toggle')
    case 'uploadFile':
      return stripSuffix(propertyName, 'FileInput', 'upload')
    case 'clickElement':
      if (propertyName.endsWith('Btn')) return stripSuffix(propertyName, 'Btn', 'click')
      if (propertyName.endsWith('Link')) return stripSuffix(propertyName, 'Link', 'click')
      return `click${capitalize(propertyName)}`
    default:
      return `interact${capitalize(propertyName)}`
  }
}

export function groupLocatorMethodName(dataTestPrefix: string, fallback: string): string {
  if (dataTestPrefix === 'add-to-cart') return 'addToCart'
  if (dataTestPrefix === 'social') return 'socialLink'
  return fallback
}

export function groupActionMethodName(locatorMethodName: string, uiAction: UiAction | string): string {
  if (locatorMethodName === 'addToCart' && uiAction === 'clickElement') return 'addProductToCart'
  if (locatorMethodName === 'socialLink' && uiAction === 'clickElement') return 'openSocialLink'
  if (locatorMethodName === 'itemImgLink' && uiAction === 'clickElement') return 'openItemImage'
  if (locatorMethodName === 'itemTitleLink' && uiAction === 'clickElement') return 'openItemTitle'
  return actionMethodName(locatorMethodName, uiAction)
}

function finalizePropertyName(base: string, kind: ElementKind): string {
  const suffix = kindSuffix(kind)
  if (!suffix) return base
  if (base.toLowerCase().endsWith(suffix.toLowerCase())) return base
  return `${base}${suffix}`
}

function stripSuffix(propertyName: string, suffix: string, verb: string): string {
  const stem = propertyName.endsWith(suffix) ? propertyName.slice(0, -suffix.length) : propertyName
  return `${verb}${capitalize(stem)}`
}

function wordsToCamel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word : capitalize(word)))
    .join('')
}

function truncateText(value?: string): string | undefined {
  if (!value) return undefined
  const words = value.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  if (words.length <= MAX_TEXT_WORDS) return words.join(' ')
  return words.slice(0, MAX_TEXT_WORDS).join(' ')
}

function capitalize(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function kindSuffix(kind: ElementKind): string {
  const map: Partial<Record<ElementKind, string>> = {
    'input-text': 'Input',
    'input-password': 'Input',
    'input-email': 'Input',
    'input-number': 'Input',
    'input-checkbox': 'Checkbox',
    'input-radio': 'Radio',
    'input-file': 'FileInput',
    button: 'Btn',
    link: 'Link',
    textarea: 'Textarea',
    select: 'Select',
  }
  return map[kind] ?? ''
}
