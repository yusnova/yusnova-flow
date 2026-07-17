/**
 * Heuristic multi-step "wizard" understanding for the no-LLM planner.
 *
 * A lot of real apps (booking funnels, checkout flows, onboarding) are a single
 * URL that swaps steps client-side: fill a field, trigger a lookup, pick an
 * option, advance, pick another option, advance, confirm. The deep DOM explorer
 * already discovers every element across those steps, but the generic form
 * planner only knew how to "fill inputs + click first button". This module turns
 * the flat element list into an ordered walkthrough so the generated happy path
 * actually clicks through the whole funnel, and negatives exercise the real form.
 */

import { ResolvedElement, TestStep } from '../types'
import { smartValue } from '../../shared/smart-values'

const RE_ADVANCE = /\b(next|continue|proceed|forward|onwards?)\b/i
const RE_ADVANCE_TESTID = /next[-_]?from[-_]?step|(?:^|[-_])step[-_]?\d/i
const RE_BACK = /\b(back|prev|previous|cancel|return)\b/i
const RE_FINAL = /\b(confirm|book|complete|finish|place[-_ ]?order|checkout|submit[-_ ]?booking|reserve|pay)\b/i
const RE_TRIGGER = /\b(lookup|look[-_ ]?up|search|find|apply|fetch|load)\b/i
const RE_SUCCESS = /\b(start[-_ ]?again|success|confirmation|confirmed|thank|booking[-_ ]?(?:id|reference|ref|number)|complete|completed|done|receipt)\b/i
const RE_UTILITY = /\b(normalize|demo|reset|clear|manual|toggle|help|info|example)\b/i

export interface WizardChoiceGroup {
  key: string
  first: ResolvedElement
  kind: 'radio' | 'button'
  minIndex: number
}

export interface WizardModel {
  inputs: ResolvedElement[]
  trigger?: ResolvedElement | undefined
  choiceGroups: WizardChoiceGroup[]
  advanceButtons: ResolvedElement[]
  finalButton?: ResolvedElement | undefined
  success?: ResolvedElement | undefined
}

function textOf(el: ResolvedElement): string {
  return `${el.dataTest ?? ''} ${el.label ?? ''} ${el.textContent ?? ''} ${el.accessibleName ?? ''} ${el.ariaLabel ?? ''}`
}

function fieldName(el: ResolvedElement): string {
  // Prefer stable test ids / property names over placeholders — placeholders like
  // "e.g. SW1A 1AA" must not defeat postcode/email smart-value matching.
  return [
    el.dataTest,
    el.dataTestId,
    el.propertyName,
    el.name,
    el.ariaLabel,
    el.label,
    el.placeholder,
  ]
    .filter(Boolean)
    .join(' ')
}

function stepNumber(el: ResolvedElement): number {
  const match = textOf(el).match(/step[-_]?(\d+)|(\d+)/i)
  const raw = match?.[1] ?? match?.[2]
  return raw ? Number(raw) : Number.MAX_SAFE_INTEGER
}

function isAdvance(el: ResolvedElement): boolean {
  const text = textOf(el)
  if (RE_BACK.test(text)) return false
  const testId = `${el.dataTest ?? ''} ${el.dataTestId ?? ''} ${el.propertyName ?? ''}`
  if (RE_ADVANCE_TESTID.test(testId) || RE_ADVANCE.test(text)) {
    // Prefer buttons, but keep data-testid next-from-step* even if kind resolved oddly.
    return el.kind === 'button' || /next[-_]?from[-_]?step/i.test(testId)
  }
  return false
}

function isFinal(el: ResolvedElement): boolean {
  return el.kind === 'button' && RE_FINAL.test(textOf(el))
}

function isTrigger(el: ResolvedElement): boolean {
  if (el.kind !== 'button') return false
  const text = textOf(el)
  if (RE_BACK.test(text)) return false
  return RE_TRIGGER.test(text) && !isAdvance(el) && !isFinal(el)
}

/** Normalizes a data-test id so sibling options collapse to one group key. */
function groupKey(el: ResolvedElement): string {
  const raw = (el.dataTest ?? el.dataTestId ?? el.propertyName ?? '').trim()
  const dashed = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
    .replace(/\d+/g, '#')

  // Explicit option-family prefixes (waste-path-*, skip-option-*, address-option-*).
  const family = dashed.match(
    /^(waste-path|skip-option|address-option|plasterboard-option|option)(?:-|$)/,
  )
  if (family) return family[1]!

  const segments = dashed.split(/-+/).filter(Boolean)
  if (segments.length <= 1) return dashed
  return segments.slice(0, -1).join('-')
}

function buildChoiceGroups(elements: ResolvedElement[]): WizardChoiceGroup[] {
  const candidates = elements.filter((el) => {
    if (el.kind === 'input-radio') return true
    if (el.kind !== 'button') return false
    const text = textOf(el)
    if (isAdvance(el) || isFinal(el) || isTrigger(el)) return false
    if (RE_BACK.test(text) || RE_UTILITY.test(text)) return false
    return true
  })

  const byKey = new Map<string, ResolvedElement[]>()
  for (const el of candidates) {
    const key = groupKey(el)
    const bucket = byKey.get(key) ?? []
    bucket.push(el)
    byKey.set(key, bucket)
  }

  const groups: WizardChoiceGroup[] = []
  for (const [key, bucket] of byKey) {
    const isRadio = bucket.every((el) => el.kind === 'input-radio')
    // A lone button is not a "choice" (it's just an action); radios always are.
    // Exception: option/path cards (waste-path-*, skip-option-*) even if only one
    // was discovered on the current step snapshot.
    const looksLikeOptionCard = /option|path|waste|skip|size|yard/i.test(key)
    if (!isRadio && bucket.length < 2 && !looksLikeOptionCard) continue
    const sorted = [...bucket].sort((a, b) => a.index - b.index)
    const first = sorted[0]
    if (!first) continue
    groups.push({
      key,
      first,
      kind: isRadio ? 'radio' : 'button',
      minIndex: first.index,
    })
  }

  return groups.sort((a, b) => {
    const rank = (g: WizardChoiceGroup) => {
      const k = g.key.toLowerCase()
      if (/address|postcode|lookup/.test(k)) return 0
      if (/waste|path/.test(k)) return 1
      if (/skip|yard|size/.test(k)) return 2
      return 3 + g.minIndex / 1000
    }
    return rank(a) - rank(b) || a.minIndex - b.minIndex
  })
}

export function detectWizard(elements: ResolvedElement[]): WizardModel | undefined {
  const inputs = elements.filter((el) => el.uiAction === 'fillInput')
  const advanceButtons = dedupeByProperty(
    elements.filter(
      (el) =>
        isAdvance(el)
        || /next[-_]?from[-_]?step\d*/i.test(`${el.dataTest ?? ''} ${el.dataTestId ?? ''} ${el.propertyName ?? ''}`),
    ),
  ).sort((a, b) => stepNumber(a) - stepNumber(b))
  const finalButton = elements.find(isFinal)
  const trigger = elements.find(isTrigger)
  const choiceGroups = buildChoiceGroups(elements)
  const success = elements.find((el) => RE_SUCCESS.test(textOf(el)))

  // Needs genuine multi-step character: at least one advance step, plus either a
  // final confirm action or at least two distinct choice groups to walk through.
  const isWizard = advanceButtons.length >= 1 && (Boolean(finalButton) || choiceGroups.length >= 2)
  if (!isWizard) return undefined

  return { inputs, trigger, choiceGroups, advanceButtons, finalButton, success }
}

function dedupeByProperty(elements: ResolvedElement[]): ResolvedElement[] {
  const seen = new Set<string>()
  const out: ResolvedElement[] = []
  for (const el of elements) {
    const key = el.propertyName || el.dataTest || el.dataTestId || String(el.index)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(el)
  }
  return out
}

function fillValue(el: ResolvedElement): string {
  const primitive =
    el.kind === 'input-number' ? 'number' : el.kind === 'input-email' ? 'string' : 'string'
  return String(smartValue(fieldName(el), primitive as 'string' | 'number'))
}

function selectFirst(pageVar: string, group: WizardChoiceGroup): string {
  return group.kind === 'radio'
    ? `await ${pageVar}.check(${pageVar}.${group.first.propertyName})`
    : `await ${pageVar}.click(${pageVar}.${group.first.propertyName})`
}

function choiceLabel(group: WizardChoiceGroup): string {
  return (group.first.label || group.first.textContent || group.key || 'option')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

/** Full happy-path walkthrough that clicks through every discovered step. */
export function buildWizardHappySteps(
  pageVar: string,
  navigate: TestStep,
  model: WizardModel,
): TestStep[] {
  const steps: TestStep[] = [navigate]

  const entryCode: string[] = model.inputs.map(
    (el) => `await ${pageVar}.fill(${pageVar}.${el.propertyName}, ${JSON.stringify(fillValue(el))})`,
  )
  if (model.trigger) {
    entryCode.push(`await ${pageVar}.click(${pageVar}.${model.trigger.propertyName})`)
  }
  if (entryCode.length > 0) {
    // After a lookup/search trigger the first choice list loads async — assert it.
    if (model.trigger && model.choiceGroups[0]) {
      entryCode.push(
        `await expect(${pageVar}.${model.choiceGroups[0].first.propertyName}).toBeVisible({ timeout: 15_000 })`,
      )
    }
    steps.push({ description: 'Enter details and start the flow', code: entryCode })
  }

  const stepCount = Math.max(model.choiceGroups.length, model.advanceButtons.length)
  const usedAdvances = new Set<string>()
  for (let i = 0; i < stepCount; i += 1) {
    const group = model.choiceGroups[i]
    const advance = model.advanceButtons[i]
    const code: string[] = []
    let description = ''

    if (group) {
      code.push(selectFirst(pageVar, group))
      description = `Choose ${choiceLabel(group)}`
    }
    if (advance) {
      code.push(`await ${pageVar}.click(${pageVar}.${advance.propertyName})`)
      usedAdvances.add(advance.propertyName)
      description = description ? `${description} and continue` : 'Continue to the next step'
    }
    if (code.length > 0) {
      steps.push({ description, code })
    }
  }

  // Click any remaining "Next" buttons that weren't paired (e.g. skip selected
  // without an advance at the same index, then next-from-step3 → review).
  for (const advance of model.advanceButtons) {
    if (usedAdvances.has(advance.propertyName)) continue
    steps.push({
      description: 'Continue to the next step',
      code: [`await ${pageVar}.click(${pageVar}.${advance.propertyName})`],
    })
    usedAdvances.add(advance.propertyName)
  }

  const finalCode: string[] = []
  if (model.finalButton) {
    finalCode.push(`await ${pageVar}.click(${pageVar}.${model.finalButton.propertyName})`)
  }
  if (model.success) {
    finalCode.push(
      `await expect(${pageVar}.${model.success.propertyName}).toBeVisible({ timeout: 15_000 })`,
    )
  } else {
    finalCode.push(`await expect(${pageVar}.page).toHaveURL(/.+/, { timeout: 15_000 })`)
  }
  steps.push({
    description: model.finalButton ? 'Confirm and assert success' : 'Assert the flow completed',
    code: finalCode,
  })

  return steps
}

function invalidValueFor(el: ResolvedElement): string {
  const name = fieldName(el).toLowerCase()
  if (/post\s*code|postal|zip/.test(name)) return 'INVALID!!'
  if (/email/.test(name)) return 'not-an-email'
  if (/phone|mobile|tel/.test(name)) return 'abc'
  return '!@#$%'
}

export type WizardNegativeKind = 'empty' | 'invalid' | 'boundary'

/**
 * Concrete negative/boundary case against the real entry form — no fixme
 * placeholder. Submits bad/empty/oversized input and asserts the flow does not
 * advance (the first result/step never appears and the user stays on the form).
 */
export function buildWizardNegativeSteps(
  pageVar: string,
  navigate: TestStep,
  model: WizardModel,
  kind: WizardNegativeKind,
): TestStep[] | undefined {
  const firstInput = model.inputs[0]
  const submit = model.trigger ?? model.advanceButtons[0] ?? model.finalButton
  if (!firstInput || !submit) return undefined

  const anchor = model.choiceGroups[0]?.first ?? model.success
  const steps: TestStep[] = [navigate]

  if (kind === 'empty') {
    steps.push({
      description: 'Submit without entering required input',
      code: [`await ${pageVar}.click(${pageVar}.${submit.propertyName})`],
    })
  } else if (kind === 'invalid') {
    steps.push({
      description: 'Enter invalid input and submit',
      code: [
        `await ${pageVar}.fill(${pageVar}.${firstInput.propertyName}, ${JSON.stringify(invalidValueFor(firstInput))})`,
        `await ${pageVar}.click(${pageVar}.${submit.propertyName})`,
      ],
    })
  } else {
    steps.push({
      description: 'Enter oversized boundary input and submit',
      code: [
        `await ${pageVar}.fill(${pageVar}.${firstInput.propertyName}, ${JSON.stringify('A'.repeat(60))})`,
        `await ${pageVar}.click(${pageVar}.${submit.propertyName})`,
      ],
    })
  }

  const assertions: string[] = [`await expect(${pageVar}.${firstInput.propertyName}).toBeVisible()`]
  if (anchor && kind !== 'boundary') {
    assertions.push(`await expect(${pageVar}.${anchor.propertyName}).toBeHidden()`)
  }
  steps.push({
    description:
      kind === 'boundary'
        ? 'Assert the page stays usable and does not crash'
        : 'Assert the flow did not advance',
    code: assertions,
  })

  return steps
}
