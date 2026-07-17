import assert from 'node:assert/strict'
import {
  acAwareNegativeVariants,
  criteriaFromAppSelectors,
  selectorDrivenCases,
} from './heuristic-enrichment'
import type { AppScanResult } from '../../shared/app-scanner'

const postcodeNegatives = acAwareNegativeVariants(
  'Verify User can look up a UK postcode',
  'User can look up a UK postcode and see matching addresses',
  'TC-1',
  'ui',
  'AC-001',
)
assert.ok(postcodeNegatives.length >= 3)
assert.ok(postcodeNegatives.some((c) => /empty postcode/i.test(c.title)))
assert.ok(postcodeNegatives.some((c) => /invalid postcode/i.test(c.title)))

const app: AppScanResult = {
  appRoot: '/tmp/booking/ui',
  detected: true,
  framework: 'next-app',
  apiRoutes: [
    {
      method: 'POST',
      routePath: '/api/postcode/lookup',
      filePath: '/tmp/booking/ui/app/api/postcode/lookup/route.ts',
      fields: [{ name: 'postcode', location: 'body', required: true, type: 'string' }],
      errorStatuses: [400],
      successStatus: 200,
      successKeys: ['addresses'],
      successFields: [{ name: 'addresses', type: 'array' }],
    },
  ],
  selectors: [
    { testId: 'postcode-input', attr: 'data-testid', filePath: 'x', kind: 'input' },
    { testId: 'lookup-button', attr: 'data-testid', filePath: 'x', kind: 'button' },
    { testId: 'waste-path-general', attr: 'data-testid', filePath: 'x', kind: 'button' },
    { testId: 'confirm-booking', attr: 'data-testid', filePath: 'x', kind: 'button' },
    { testId: 'lookup-error', attr: 'data-testid', filePath: 'x', kind: 'region' },
    { testId: 'booking-success', attr: 'data-testid', filePath: 'x', kind: 'region' },
  ],
  fetchTargets: ['/api/postcode/lookup'],
}

const criteria = criteriaFromAppSelectors(app, 'booking')
assert.ok(criteria.some((c) => /postcode/i.test(c)))
assert.ok(criteria.some((c) => /waste/i.test(c)))
assert.ok(criteria.some((c) => /confirm/i.test(c)))
assert.ok(criteria.some((c) => /API POST \/api\/postcode\/lookup/i.test(c)))

const cases = selectorDrivenCases(app, 'booking', 0)
assert.ok(cases.length >= 5, `expected rich selector cases, got ${cases.length}`)
assert.ok(cases.some((c) => c.priority === 'P0'))
assert.ok(cases.some((c) => c.type === 'negative'))

console.log('heuristic-enrichment: all tests passed')
