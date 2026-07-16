export const POM_TEMPLATE = `import { Locator, Page } from '@playwright/test'
import { BasePage } from './base-page'

export class {{pageName}} extends BasePage {
{{#each locators}}
  readonly {{propertyName}}: Locator
{{/each}}

  constructor(page: Page) {
    super(page)
{{#each locators}}
    this.{{propertyName}} = page.locator({{{selectorExpr}}})
{{/each}}
  }

{{#each locatorMethods}}
  {{name}}({{params}}): Locator {
    {{{body}}}
  }

{{/each}}
{{#each methods}}
  async {{name}}({{params}}): Promise<void> {
{{#each steps}}
    {{{line}}}
{{/each}}
  }

{{/each}}
}
`
