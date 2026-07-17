import { test } from '@domains/booking/booking.fixture'
import { ApiAssertions } from '@core/api/api-assertions'
import { withExpectedStatus } from '@core/api/axios-client'
import { wasteTypesResponseSchema, skipsResponseSchema, postcodeLookupResponseSchema, bookingConfirmResponseSchema } from '@domains/booking/booking.schemas'

test.describe('[BookingAPI] POST /api/waste-types', () => {

  test('[WasteTypesValid] | verify that a valid request returns 200 with the expected body', async ({ foundryAPI }) => {
    await test.step('send a valid POST /api/waste-types request', async () => {
      const res = await foundryAPI.Booking.wasteTypes({  })
      ApiAssertions.assertStatus(res, 200)
      ApiAssertions.assertSchema(res, wasteTypesResponseSchema)
    })
  })

})

test.describe('[BookingAPI] GET /api/skips', () => {

  test('[SkipsValid] | verify that a valid request returns 200 with the expected body', async ({ foundryAPI }) => {
    await test.step('send a valid GET /api/skips request', async () => {
      const res = await foundryAPI.Booking.skips({ "postcode": "SW1A 1AA" })
      ApiAssertions.assertStatus(res, 200)
      ApiAssertions.assertSchema(res, skipsResponseSchema)
    })
  })

  test('[SkipsMissingPostcode] | verify that a request missing "postcode" returns 400', async ({ foundryAPI }) => {
    await test.step('send GET /api/skips without "postcode"', async () => {
      const res = await foundryAPI.Booking.skips({  } as never, withExpectedStatus(400))
      ApiAssertions.assertStatus(res, 400)
    })
  })

})

test.describe('[BookingAPI] POST /api/postcode/lookup', () => {

  test('[PostcodeLookupValid] | verify that a valid request returns 200 with the expected body', async ({ foundryAPI }) => {
    await test.step('send a valid POST /api/postcode/lookup request', async () => {
      const res = await foundryAPI.Booking.postcodeLookup({ "postcode": "SW1A 1AA" })
      ApiAssertions.assertStatus(res, 200)
      ApiAssertions.assertSchema(res, postcodeLookupResponseSchema)
    })
  })

  test('[PostcodeLookupMissingPostcode] | verify that a request missing "postcode" returns 400', async ({ foundryAPI }) => {
    await test.step('send POST /api/postcode/lookup without "postcode"', async () => {
      const res = await foundryAPI.Booking.postcodeLookup({  } as never, withExpectedStatus(400))
      ApiAssertions.assertStatus(res, 400)
    })
  })

})

test.describe('[BookingAPI] POST /api/booking/confirm', () => {

  test('[BookingConfirmValid] | verify that a valid request returns 200 with the expected body', async ({ foundryAPI }) => {
    await test.step('send a valid POST /api/booking/confirm request', async () => {
      const res = await foundryAPI.Booking.bookingConfirm({ "postcode": "SW1A 1AA", "skipSize": "4-yard", "price": 120 })
      ApiAssertions.assertStatus(res, 200)
      ApiAssertions.assertSchema(res, bookingConfirmResponseSchema)
    })
  })

  test('[BookingConfirmMissingPostcode] | verify that a request missing "postcode" returns 400', async ({ foundryAPI }) => {
    await test.step('send POST /api/booking/confirm without "postcode"', async () => {
      const res = await foundryAPI.Booking.bookingConfirm({ "skipSize": "4-yard", "price": 120 } as never, withExpectedStatus(400))
      ApiAssertions.assertStatus(res, 400)
    })
  })

  test('[BookingConfirmMissingSkipSize] | verify that a request missing "skipSize" returns 400', async ({ foundryAPI }) => {
    await test.step('send POST /api/booking/confirm without "skipSize"', async () => {
      const res = await foundryAPI.Booking.bookingConfirm({ "postcode": "SW1A 1AA", "price": 120 } as never, withExpectedStatus(400))
      ApiAssertions.assertStatus(res, 400)
    })
  })

  test('[BookingConfirmMissingPrice] | verify that a request missing "price" returns 400', async ({ foundryAPI }) => {
    await test.step('send POST /api/booking/confirm without "price"', async () => {
      const res = await foundryAPI.Booking.bookingConfirm({ "postcode": "SW1A 1AA", "skipSize": "4-yard" } as never, withExpectedStatus(400))
      ApiAssertions.assertStatus(res, 400)
    })
  })

  test('[BookingConfirmInvalidPostcode] | verify that an invalid "postcode" type returns 400', async ({ foundryAPI }) => {
    await test.step('send POST /api/booking/confirm with an invalid "postcode" type', async () => {
      const res = await foundryAPI.Booking.bookingConfirm({ "postcode": 12345, "skipSize": "4-yard", "price": 120 } as never, withExpectedStatus(400))
      ApiAssertions.assertStatus(res, 400)
    })
  })

  test('[BookingConfirmInvalidSkipSize] | verify that an invalid "skipSize" type returns 400', async ({ foundryAPI }) => {
    await test.step('send POST /api/booking/confirm with an invalid "skipSize" type', async () => {
      const res = await foundryAPI.Booking.bookingConfirm({ "postcode": "SW1A 1AA", "skipSize": 12345, "price": 120 } as never, withExpectedStatus(400))
      ApiAssertions.assertStatus(res, 400)
    })
  })

  test('[BookingConfirmInvalidPrice] | verify that an invalid "price" type returns 400', async ({ foundryAPI }) => {
    await test.step('send POST /api/booking/confirm with an invalid "price" type', async () => {
      const res = await foundryAPI.Booking.bookingConfirm({ "postcode": "SW1A 1AA", "skipSize": "4-yard", "price": "not-a-number" } as never, withExpectedStatus(400))
      ApiAssertions.assertStatus(res, 400)
    })
  })

})
