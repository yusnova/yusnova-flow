export const SPEC_TEMPLATE = `import { test, expect } from '{{fixtureImport}}'

{{#each groups}}
test.describe('[{{pageName}}] {{groupName}}', () => {
{{#each cases}}
  test('[{{testName}}] | verify that {{title}}', async ({ {{fixtures}} }) => {
{{#each steps}}
    await test.step('{{description}}', async () => {
{{#each lines}}
      {{{this}}}
{{/each}}
    })
{{/each}}
  })

{{/each}}
})
{{/each}}
`
