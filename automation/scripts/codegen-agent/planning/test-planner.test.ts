import assert from 'node:assert/strict'
import { TestPlanner } from './test-planner'
import { ResolvedElement } from '../types'

function resolvedEl(partial: Partial<ResolvedElement> & Pick<ResolvedElement, 'kind' | 'tagName' | 'propertyName'>): ResolvedElement {
  return {
    classes: [],
    parentPath: '',
    ancestorSelectors: [],
    isRequired: false,
    isDisabled: false,
    index: 0,
    label: partial.propertyName,
    locator: { selector: `#${partial.propertyName}`, strategy: 'id', confidence: 'high' },
    uiAction: 'clickElement',
    ...partial,
  }
}

const url = 'https://demo.example.com/dynamic-content'

// --- detectPattern via generate(): no form controls -> 'interactive' ---
{
  const clickHereLink = resolvedEl({
    kind: 'link',
    tagName: 'a',
    propertyName: 'clickHereLink',
    label: 'click here',
    href: '/dynamic-content',
  })
  const externalLink = resolvedEl({
    kind: 'link',
    tagName: 'a',
    propertyName: 'elementalSeleniumLink',
    label: 'Elemental Selenium',
    href: 'https://elementalselenium.com',
  })

  const plan = new TestPlanner().generate({
    pageName: 'DynamicContentPage',
    domain: 'example',
    url,
    elements: [clickHereLink, externalLink],
  })

  assert.equal(plan.pattern, 'interactive')
  const cases = plan.testGroups.flatMap((g) => g.cases)
  assert.equal(cases.length, 1)
  assert.ok(!/form submission/i.test(cases[0]!.title), 'should not fabricate a form-submission title')
  assert.match(cases[0]!.title, /click here/i)

  const stepLines = cases[0]!.steps.flatMap((s) => s.code).join('\n')
  assert.match(stepLines, /captureText/)
  assert.match(stepLines, /expectContentChanged/)
  // the external link must never be chosen as the click target
  assert.ok(!stepLines.includes('elementalSeleniumLink'))
}

// --- a page with only inputs+submit still uses the real form pattern ---
{
  const email = resolvedEl({ kind: 'input-email', tagName: 'input', propertyName: 'emailInput', uiAction: 'fillInput' })
  const password = resolvedEl({ kind: 'input-password', tagName: 'input', propertyName: 'passwordInput', uiAction: 'fillInput' })
  const submit = resolvedEl({ kind: 'button', tagName: 'button', propertyName: 'submitButton', uiAction: 'clickElement' })

  const plan = new TestPlanner().generate({
    pageName: 'LoginPage',
    domain: 'auth',
    url: 'https://demo.example.com/login',
    elements: [email, password, submit],
  })

  assert.equal(plan.pattern, 'login')
}

// --- generic-form pattern still applies when there is a fillable input + submit but no known pattern matches ---
{
  const comment = resolvedEl({ kind: 'input-text', tagName: 'input', propertyName: 'commentInput', uiAction: 'fillInput' })
  const submit = resolvedEl({ kind: 'button', tagName: 'button', propertyName: 'submitButton', uiAction: 'clickElement' })

  const plan = new TestPlanner().generate({
    pageName: 'FeedbackPage',
    domain: 'feedback',
    url: 'https://demo.example.com/feedback',
    elements: [comment, submit],
  })

  assert.equal(plan.pattern, 'generic-form')
  const cases = plan.testGroups.flatMap((g) => g.cases)
  assert.ok(cases.some((c) => /form submission/i.test(c.title)))
}

// --- a link-heavy page (content listing) still uses the lightweight fallback, not per-link click cases ---
{
  const links = Array.from({ length: 10 }, (_, i) =>
    resolvedEl({ kind: 'link', tagName: 'a', propertyName: `navLink${i}`, label: `Nav ${i}`, href: `/nav-${i}` }),
  )

  const plan = new TestPlanner().generate({
    pageName: 'BlogPage',
    domain: 'blog',
    url: 'https://demo.example.com/blog',
    elements: links,
  })

  assert.equal(plan.pattern, 'interactive')
  const cases = plan.testGroups.flatMap((g) => g.cases)
  assert.equal(cases.length, 2)
  assert.ok(cases.every((c) => !/click here|Nav /i.test(c.title)))
}

console.log('test-planner: all tests passed')
