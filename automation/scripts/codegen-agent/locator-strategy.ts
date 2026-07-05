import { ElementInfo, ResolvedElement } from './types'
import { labelFromElement, propertyNameFromElement } from './page-analyser'
import { pickElementLocator } from './locator-priority'

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
        locator: pickElementLocator(el),
        uiAction: this.pickUiAction(el),
      }
    })
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
