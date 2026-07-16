import { ElementInfo, ElementKind, UiAction } from '../types'

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
  const base = propertyStemFromElement(el)
  if (!el.surfaceContext) return base
  const context = capitalize(wordsToCamel(el.surfaceContext))
  if (base.toLowerCase().startsWith(context.toLowerCase())) return base
  return `${context}${capitalize(base)}`
}

function propertyStemFromElement(el: ElementInfo): string {
  const testName =
    el.dataTest ??
    el.dataTestId ??
    el.dataTestIdHyphen ??
    el.dataCy ??
    el.dataQa
  if (testName) return finalizePropertyName(nameFromDataTest(testName), el.kind)

  if (el.kind === 'select') {
    if (el.name) return finalizePropertyName(wordsToCamel(el.name), el.kind)
    if (el.id) return finalizePropertyName(wordsToCamel(el.id), el.kind)
    return 'dropdownSelect'
  }

  if (el.id) {
    const fromId = wordsToCamel(el.id.replace(/^lang-/, 'lang-'))
    if (fromId) return finalizePropertyName(fromId, el.kind)
  }

  const label =
    el.ariaLabel ??
    el.accessibleName ??
    el.placeholder ??
    el.name ??
    truncateText(el.textContent)

  if (label) {
    const camel = wordsToCamel(label)
    if (camel) return finalizePropertyName(camel, el.kind)
    const slug = slugFromAccessibleLabel(label)
    if (slug) return finalizePropertyName(slug, el.kind)
  }

  if (el.id) return finalizePropertyName(wordsToCamel(el.id.replace(/-/g, ' ')) || slugFromAccessibleLabel(el.id), el.kind)

  return finalizePropertyName(wordsToCamel(el.kind), el.kind)
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
  if (!stem) return `${verb}${capitalize(suffix)}`
  return `${verb}${capitalize(stem)}`
}

function splitIdentifier(raw: string): string[] {
  const withSpaces = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()

  return withSpaces.split(/\s+/).filter(Boolean).map((token) => token.toLowerCase())
}

function normalizeNameTokens(tokens: string[]): string[] {
  const normalized: string[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!
    const next = tokens[i + 1]
    if ((token === 'drop' && next === 'btn') || (token === 'drop' && next === 'button')) {
      normalized.push('dropdown')
      i += 1
      continue
    }
    normalized.push(token)
  }
  return normalized
}

function tokensToCamel(tokens: string[]): string {
  if (tokens.length === 0) return ''
  return tokens
    .map((word, index) => (index === 0 ? word : capitalize(word)))
    .join('')
}

function foldTurkish(value: string): string {
  return value
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
}

function wordsToCamel(raw: string): string {
  const normalized = foldTurkish(raw)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ' ')
    .trim()

  const splitTokens = splitIdentifier(normalized.replace(/[^a-zA-Z0-9]+/g, ' '))
  if (splitTokens.length > 0) {
    return tokensToCamel(normalizeNameTokens(splitTokens))
  }

  const words = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return ''

  return tokensToCamel(words)
}

/** Fallback when label has no latin letters (e.g. العربية, Русский). */
function slugFromAccessibleLabel(label: string): string {
  const text = label.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim()
  if (!text) return ''

  if (/[\u0600-\u06FF]/.test(text)) return 'langAr'
  if (/[\u0400-\u04FF]/.test(text)) return 'langRu'
  if (/[\u4e00-\u9fff]/.test(text)) return 'langZh'
  if (/[\u3040-\u30ff]/.test(text)) return 'langJa'
  if (/[\uac00-\ud7af]/.test(text)) return 'langKo'

  return ''
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
