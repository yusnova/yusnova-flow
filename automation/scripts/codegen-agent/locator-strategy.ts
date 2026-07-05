import { ElementInfo, LocatorResult, ResolvedElement } from './types'
import { labelFromElement, propertyNameFromElement } from './page-analyser'

const GENERATED_CLASS_PATTERN = /^(css-|sc-|chakra-|_[a-z]|[a-z]+-[a-f0-9]{5,})/

export class LocatorStrategy {
  resolve(elements: ElementInfo[]): ResolvedElement[] {
    const usedNames = new Set<string>()

    return elements.map((el) => {
      const baseName = propertyNameFromElement(el)
      let propertyName = baseName
      let counter = 2

      while (usedNames.has(propertyName)) {
        propertyName = `${baseName}${counter}`
        counter++
      }
      usedNames.add(propertyName)

      return {
        ...el,
        propertyName,
        label: labelFromElement(el),
        locator: this.pickLocator(el),
        uiAction: this.pickUiAction(el),
      }
    })
  }

  private pickLocator(el: ElementInfo): LocatorResult {
    if (el.dataTestId) {
      return {
        selector: `[data-testid="${escapeAttr(el.dataTestId)}"]`,
        strategy: 'data-testid',
        confidence: 'high',
      }
    }

    if (el.dataTest) {
      return {
        selector: `[data-test="${escapeAttr(el.dataTest)}"]`,
        strategy: 'data-test',
        confidence: 'high',
      }
    }

    if (el.id && !GENERATED_CLASS_PATTERN.test(el.id)) {
      return { selector: `#${el.id}`, strategy: 'id', confidence: 'high' }
    }

    if (el.name) {
      return {
        selector: `${el.tagName}[name="${escapeAttr(el.name)}"]`,
        strategy: 'name',
        confidence: 'medium',
      }
    }

    if (el.ariaLabel) {
      return {
        selector: `[aria-label="${escapeAttr(el.ariaLabel)}"]`,
        strategy: 'aria-label',
        confidence: 'medium',
      }
    }

    if (el.placeholder) {
      return {
        selector: `[placeholder="${escapeAttr(el.placeholder)}"]`,
        strategy: 'placeholder',
        confidence: 'medium',
      }
    }

    return this.buildCssPath(el)
  }

  private buildCssPath(el: ElementInfo): LocatorResult {
    let elFrag = el.tagName

    if (el.type) {
      elFrag += `[type="${escapeAttr(el.type)}"]`
    } else if (el.placeholder) {
      elFrag += `[placeholder="${escapeAttr(el.placeholder)}"]`
    } else if (el.kind === 'button' && el.textContent) {
      const safe = el.textContent.replace(/"/g, '\\"').slice(0, 30)
      if (el.tagName === 'input') {
        elFrag = `input[value="${safe}"]`
      } else {
        elFrag += `:has-text("${safe}")`
      }
    }

    const stableAncestors = el.ancestorSelectors
      .map((a) => this.stripGeneratedClasses(a))
      .filter(Boolean)

    const parts = [...stableAncestors.slice(-2), elFrag]
    return { selector: parts.join(' '), strategy: 'css-path', confidence: 'low' }
  }

  private stripGeneratedClasses(selector: string): string {
    return selector
      .split('.')
      .filter((part, i) => i === 0 || !GENERATED_CLASS_PATTERN.test(part))
      .join('.')
  }

  private pickUiAction(el: ElementInfo): ResolvedElement['uiAction'] {
    switch (el.kind) {
      case 'input-text':
      case 'input-email':
      case 'input-password':
      case 'input-number':
      case 'textarea':
        return 'fillInput'
      case 'input-checkbox':
      case 'input-radio':
        return 'checkCheckbox'
      case 'select':
        return 'selectOption'
      case 'input-file':
        return 'uploadFile'
      default:
        return 'clickElement'
    }
  }
}

function escapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
