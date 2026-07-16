import assert from 'node:assert/strict'
import { CodegenAdapter } from './codegen-adapter'

const adapter = new CodegenAdapter()

const actions = adapter.transform(
  'await page.goBack();',
  [],
  'mainPage',
)

assert.equal(actions.length, 1)
assert.equal(actions[0]?.transformed, 'await mainPage.goBack()')
assert.equal(actions[0]?.isRemoved, false)

const urlExpect = adapter.transform(
  "expect(page).toHaveURL('https://example.com/')",
  [],
  'mainPage',
)

assert.equal(urlExpect[0]?.transformed, 'await expect(mainPage.page).toHaveURL("https://example.com/")')

const roleLink = adapter.transform(
  'await page.locator("role=link[name=\\"Ana Sayfa\\"]").click();',
  [{
    propertyName: 'anaSayfaLink',
    uiAction: 'clickElement',
    kind: 'link',
    tagName: 'a',
    locator: { selector: 'role=link[name="Ana Sayfa"]', strategy: 'role', confidence: 'high' },
    label: 'Ana Sayfa',
    classes: [],
    parentPath: '',
    ancestorSelectors: [],
    isRequired: false,
    isDisabled: false,
    index: 0,
    accessibleName: 'Ana Sayfa',
  }],
  'mainPage',
)

assert.equal(roleLink[0]?.transformed, 'await mainPage.clickLinkByName("Ana Sayfa")')

const fallbackLink = adapter.transform(
  'await page.locator("role=link[name=\\"Unknown\\"]").click();',
  [],
  'mainPage',
)

assert.equal(fallbackLink[0]?.transformed, 'await mainPage.clickLinkByName("Unknown")')

console.log('codegen-adapter: all tests passed')
