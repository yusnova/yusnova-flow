import assert from 'node:assert/strict'
import { classifyLinkTarget, escapeRegExp, isDestructiveLabel } from './interaction-safety'

const pageUrl = 'https://demo.example.com/dynamic-content'

assert.equal(classifyLinkTarget('/dynamic-content', pageUrl), 'same-page')
assert.equal(classifyLinkTarget('#section', pageUrl), 'same-page')
assert.equal(classifyLinkTarget('', pageUrl), 'same-page')
assert.equal(classifyLinkTarget('/checkout', pageUrl), 'internal-nav')
assert.equal(classifyLinkTarget('https://external-site.example.com', pageUrl), 'external')
assert.equal(classifyLinkTarget('javascript:void(0)', pageUrl), 'external')

assert.equal(isDestructiveLabel('Delete account'), true)
assert.equal(isDestructiveLabel('Logout'), true)
assert.equal(isDestructiveLabel('Sign out'), true)
assert.equal(isDestructiveLabel('Purchase now'), true)
assert.equal(isDestructiveLabel('click here'), false)
assert.equal(isDestructiveLabel('Learn more'), false)

assert.equal(escapeRegExp('/dynamic-content?a=1'), '/dynamic-content\\?a=1')
assert.equal(escapeRegExp('a.b+c'), 'a\\.b\\+c')

console.log('interaction-safety: all tests passed')
