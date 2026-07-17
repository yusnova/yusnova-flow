import assert from 'node:assert/strict'
import { parseAcceptanceCriteria } from './ac-parser'

const inline = parseAcceptanceCriteria(
  'AC1: User can look up a UK postcode (SW1A 1AA) and see matching addresses. AC2: User can select waste type and skip size. AC3: Empty postcode (EC1A 1BB) shows empty state with manual address. AC4: Invalid/empty lookup shows validation error. AC5: User can confirm a booking end-to-end.',
)
assert.equal(inline.length, 5, `expected 5 ACs, got ${inline.length}: ${JSON.stringify(inline)}`)
assert.match(inline[0]!.text, /look up a UK postcode/i)
assert.match(inline[4]!.text, /confirm a booking/i)

const bullets = parseAcceptanceCriteria(`
- User can open the booking page
- User can look up a postcode
`)
assert.equal(bullets.length, 2)

const numbered = parseAcceptanceCriteria('1. Enter postcode 2. Select waste 3. Confirm booking')
assert.ok(numbered.length >= 3, `expected >=3 numbered ACs, got ${numbered.length}`)

const prose = parseAcceptanceCriteria(
  'User can enter a UK postcode. User can select a waste type. User can confirm the booking.',
)
assert.equal(prose.length, 3)

console.log('ac-parser: all tests passed')
