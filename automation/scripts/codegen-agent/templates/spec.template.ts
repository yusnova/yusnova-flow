export const SPEC_TEMPLATE = `import { test, expect } from '{{fixtureImport}}'

{{#each groups}}
test.describe('[{{../pageName}}] {{groupName}}', () => {
{{#each cases}}
{{#if fixme}}
  test.fixme('[{{testName}}] | verify that {{title}}', async ({ {{fixtures}} }) => {
{{else}}
  test('[{{testName}}] | verify that {{title}}', async ({ {{fixtures}} }) => {
{{/if}}
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
