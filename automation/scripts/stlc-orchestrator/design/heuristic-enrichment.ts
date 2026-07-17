/**
 * No-LLM design enrichment.
 *
 * Turns app-under-test scan data (API routes, selectors, fetch targets) and
 * structured acceptance criteria into concrete designed cases — including
 * AC-aware negatives, form-control coverage, and integration risks — without
 * calling an LLM.
 */
import type { AppScanResult, ScannedSelector } from '../../shared/app-scanner'
import type { DesignedTestCase, TestLevel } from '../types'

const PRIMARY_ACTION = /lookup|search|submit|confirm|book|next|continue|login|save|apply|checkout/i
const INPUT_CONTROL = /input|field|postcode|postal|email|password|address|name|phone|search/i
const CHOICE_CONTROL = /option|waste|skip|size|path|radio|select|toggle|manual/i
const ERROR_CONTROL = /error|retry|alert|invalid|fail/i
const SUCCESS_CONTROL = /success|confirm(?:ed|ation)?|thank|booking-id|receipt|done/i

/** Smarter negatives keyed off AC wording (empty vs invalid vs boundary). */
export function acAwareNegativeVariants(
  baseTitle: string,
  acText: string,
  baseId: string,
  level: TestLevel,
  acId: string,
): DesignedTestCase[] {
  const lower = acText.toLowerCase()
  const cases: DesignedTestCase[] = []

  if (/postcode|postal|zip|address lookup|look\s*up/.test(lower)) {
    cases.push(
      caseOf(`${baseId}-N1`, `${baseTitle} with empty postcode`, 'negative', 'P0', level, [acId], [
        'Leave postcode empty',
        'Click lookup / search',
        'Assert validation or blocked lookup',
      ], 'Empty postcode is a high-risk validation path'),
      caseOf(`${baseId}-N2`, `${baseTitle} with invalid postcode format`, 'negative', 'P1', level, [acId], [
        'Enter a non-UK / malformed postcode',
        'Click lookup',
        'Assert format validation error',
      ], 'Invalid format equivalence class'),
      caseOf(`${baseId}-N3`, `${baseTitle} with empty-result postcode`, 'edge', 'P1', level, [acId], [
        'Enter a known empty-result fixture postcode',
        'Click lookup',
        'Assert empty state and manual-address escape hatch',
      ], 'Empty-result / manual-address edge path'),
    )
    return cases
  }

  if (/waste|skip|size|select|choose|option/.test(lower)) {
    cases.push(
      caseOf(`${baseId}-N1`, `${baseTitle} without selecting a required option`, 'negative', 'P1', level, [acId], [
        'Skip selecting waste/skip/size',
        'Attempt to continue',
        'Assert continue is blocked or error shown',
      ], 'Required choice missing'),
      caseOf(`${baseId}-N2`, `${baseTitle} with restricted waste/size combination`, 'boundary', 'P2', level, [acId], [
        'Select a waste type that disables certain skip sizes',
        'Assert disabled sizes cannot be chosen',
      ], 'Business-rule boundary between waste and skip'),
    )
    return cases
  }

  if (/confirm|book|submit|checkout|pay/.test(lower)) {
    cases.push(
      caseOf(`${baseId}-N1`, `${baseTitle} when upstream confirm API fails`, 'negative', 'P1', level, [acId], [
        'Reach review step with valid selections',
        'Trigger confirm failure path',
        'Assert error is shown and user can retry',
      ], 'Confirm integration failure'),
    )
    return cases
  }

  if (/form|input|required|field|enter|fill/.test(lower)) {
    cases.push(
      caseOf(`${baseId}-N1`, `${baseTitle} with empty required fields`, 'negative', 'P1', level, [acId], [
        'Leave required fields empty',
        'Submit',
        'Assert blocked submission',
      ], 'Empty-state negative coverage'),
      caseOf(`${baseId}-N2`, `${baseTitle} with invalid input`, 'negative', 'P1', level, [acId], [
        'Provide invalid data',
        'Submit action',
        'Assert validation error',
      ], 'Invalid input equivalence class'),
      caseOf(`${baseId}-N3`, `${baseTitle} with boundary values`, 'boundary', 'P2', level, [acId], [
        'Use min/max boundary input',
        'Submit',
        'Assert expected boundary behaviour',
      ], 'Boundary value analysis'),
    )
    return cases
  }

  return [
    caseOf(`${baseId}-N1`, `${baseTitle} with invalid input`, 'negative', 'P1', level, [acId], [
      'Provide invalid data',
      'Submit action',
      'Assert validation error',
    ], 'Negative path required by test design policy'),
  ]
}

/** Build UI cases from scanned data-testid / data-test controls. */
export function selectorDrivenCases(
  app: AppScanResult | undefined,
  domain: string,
  startIndex: number,
): DesignedTestCase[] {
  if (!app?.selectors?.length) return []

  const cases: DesignedTestCase[] = []
  let idx = startIndex
  const seenThemes = new Set<string>()

  const pushTheme = (
    theme: string,
    title: string,
    type: DesignedTestCase['type'],
    priority: DesignedTestCase['priority'],
    steps: string[],
    reason: string,
  ) => {
    if (seenThemes.has(theme)) return
    seenThemes.add(theme)
    idx += 1
    cases.push(
      caseOf(`TC-SEL-${idx}`, title, type, priority, 'ui', [], steps, reason),
    )
  }

  const inputs = app.selectors.filter((s) => s.kind === 'input' || INPUT_CONTROL.test(s.testId))
  const actions = app.selectors.filter((s) => s.kind === 'button' && PRIMARY_ACTION.test(s.testId))
  const choices = app.selectors.filter((s) => CHOICE_CONTROL.test(s.testId))
  const errors = app.selectors.filter((s) => ERROR_CONTROL.test(s.testId))
  const success = app.selectors.filter((s) => SUCCESS_CONTROL.test(s.testId))

  if (inputs.length > 0 && actions.length > 0) {
    pushTheme(
      'happy-form',
      `User completes the primary ${domain} form using discovered inputs and actions`,
      'happy-path',
      'P0',
      [
        `Fill ${summarizeSelectors(inputs.slice(0, 4))}`,
        `Click ${summarizeSelectors(actions.slice(0, 3))}`,
        'Assert next step or success state is reachable',
      ],
      'Selector inventory: primary form happy path',
    )
  }

  // Only surface the highest-signal controls — not one case per test id (that
  // floods the suite with near-identical wizard replays).
  for (const input of inputs.filter((s) => INPUT_CONTROL.test(s.testId)).slice(0, 3)) {
    pushTheme(
      `input-${input.testId}`,
      `User can interact with "${input.testId}" on the ${domain} flow`,
      'happy-path',
      'P1',
      [
        `Locate [data-testid="${input.testId}"]`,
        'Enter a realistic value for the field',
        'Assert the control accepts input and remains usable',
      ],
      `Form field coverage from app scan (${input.filePath})`,
    )
  }

  for (const action of actions.filter((s) => /confirm|book|submit|lookup|next/.test(s.testId)).slice(0, 5)) {
    pushTheme(
      `action-${action.testId}`,
      `User can trigger "${action.testId}" during the ${domain} flow`,
      'happy-path',
      /confirm|book|submit|lookup/.test(action.testId) ? 'P0' : 'P1',
      [
        'Prepare required upstream fields',
        `Click [data-testid="${action.testId}"]`,
        'Assert expected transition or response',
      ],
      `Primary action coverage from app scan (${action.filePath})`,
    )
  }

  if (choices.length > 0) {
    pushTheme(
      'choices',
      `User can select each major option group on the ${domain} flow`,
      'happy-path',
      'P1',
      [
        `Exercise option controls: ${summarizeSelectors(choices.slice(0, 6))}`,
        'Continue to the next step',
        'Assert selection is reflected downstream',
      ],
      'Choice/option coverage from app scan',
    )
  }

  if (errors.length > 0) {
    pushTheme(
      'errors',
      `Validation and error surfaces are reachable on the ${domain} flow`,
      'negative',
      'P1',
      [
        'Trigger an invalid or empty submission',
        `Assert error controls visible: ${summarizeSelectors(errors.slice(0, 4))}`,
        'Assert recovery action (retry / fix) is available',
      ],
      'Error-state selector coverage',
    )
  }

  if (success.length > 0) {
    pushTheme(
      'success',
      `Successful ${domain} completion surfaces confirmation UI`,
      'happy-path',
      'P0',
      [
        'Complete the happy path end-to-end',
        `Assert success markers: ${summarizeSelectors(success.slice(0, 4))}`,
      ],
      'Success-state selector coverage',
    )
  }

  return cases
}

/** Infer extra AC lines from scanned selectors when prose ACs are thin. */
export function criteriaFromAppSelectors(app: AppScanResult | undefined, domain: string): string[] {
  if (!app?.selectors?.length) return []
  const lines: string[] = []
  const ids = app.selectors.map((s) => s.testId.toLowerCase())

  if (ids.some((id) => /postcode|postal/.test(id))) {
    lines.push('User can enter a UK postcode and look up matching addresses')
  }
  if (ids.some((id) => /manual-address/.test(id))) {
    lines.push('User can enter an address manually when lookup returns no results')
  }
  if (ids.some((id) => /waste/.test(id))) {
    lines.push('User can select a waste type before choosing a skip')
  }
  if (ids.some((id) => /skip/.test(id))) {
    lines.push('User can select an available skip size based on waste rules')
  }
  if (ids.some((id) => /confirm|booking/.test(id))) {
    lines.push('User can review pricing and confirm the booking')
  }
  if (ids.some((id) => /lookup-error|retry/.test(id))) {
    lines.push('User sees a clear error and can retry when postcode lookup fails')
  }
  if (ids.some((id) => /success|booking-id/.test(id))) {
    lines.push('User sees a booking confirmation with a reference id after success')
  }

  if (lines.length === 0 && app.selectors.some((s) => s.kind === 'input' || s.kind === 'button')) {
    lines.push(`User can complete the interactive ${domain} flow using on-page controls`)
  }

  for (const route of app.apiRoutes.slice(0, 6)) {
    lines.push(`API ${route.method} ${route.routePath} accepts a valid request and returns ${route.successStatus}`)
  }

  return lines
}

function summarizeSelectors(selectors: ScannedSelector[]): string {
  return selectors.map((s) => s.testId).join(', ')
}

function caseOf(
  id: string,
  title: string,
  type: DesignedTestCase['type'],
  priority: DesignedTestCase['priority'],
  level: TestLevel,
  acceptanceCriteriaIds: string[],
  steps: string[],
  reason: string,
): DesignedTestCase {
  return {
    id,
    title,
    level,
    type,
    priority,
    acceptanceCriteriaIds,
    steps,
    status: 'draft',
    confidence: 0.84,
    reason,
  }
}
