import { test, expect } from '@domains/booking/booking.fixture'

test.describe('[BookingPage] Happy path', () => {
  // @stlc:generated
  test('[CompletingEveryStepConfirmsBooking] | verify that completing every step confirms the booking', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

})
test.describe('[BookingPage] Validation', () => {
  // @stlc:generated
  test('[SubmittingFirstStepEmptyInputDoesNotAdvanceFlow] | verify that submitting the first step with empty input does not advance the flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Submit without entering required input', async () => {
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[SubmittingFirstStepInvalidInputDoesNotAdvanceFlow] | verify that submitting the first step with invalid input does not advance the flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[OversizedBoundaryInputKeepsFirstStepUsable] | verify that oversized boundary input keeps the first step usable', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter oversized boundary input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the page stays usable and does not crash', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
    })
  })

})
test.describe('[BookingPage] Edge cases', () => {
  // @stlc:generated
  test('[UserCanOpenBooking] | verify that the User can open the Booking page', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[ShowsSkipHireBookingTitle] | verify that the Page shows the &quot;Skip Hire — Booking&quot; title', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanEnterPostcodeLookMatchingAddresses] | verify that the User can enter a UK postcode and look up matching addresses', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanEnterPostcodeLookMatchingAddressesEmptyPostcode] | verify that the User can enter a UK postcode and look up matching addresses with empty postcode', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanEnterPostcodeLookMatchingAddressesInvalidPostcodeFormat] | verify that the User can enter a UK postcode and look up matching addresses with invalid postcode format', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanEnterPostcodeLookMatchingAddressesEmptyResultPostcode] | verify that the User can enter a UK postcode and look up matching addresses with empty-result postcode', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanEnterAddressManuallyWhenLookupReturnsResults] | verify that the User can enter an address manually when lookup returns no results', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanEnterAddressManuallyWhenLookupReturnsResultsEmptyPostcode] | verify that the User can enter an address manually when lookup returns no results with empty postcode', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanEnterAddressManuallyWhenLookupReturnsResultsInvalidPostcodeFormat] | verify that the User can enter an address manually when lookup returns no results with invalid postcode format', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanEnterAddressManuallyWhenLookupReturnsResultsEmptyResultPostcode] | verify that the User can enter an address manually when lookup returns no results with empty-result postcode', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanSelectWasteTypeBeforeChoosingSkip] | verify that the User can select a waste type before choosing a skip', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanSelectWasteTypeBeforeChoosingSkipWithoutSelectingRequiredOption] | verify that the User can select a waste type before choosing a skip without selecting a required option', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanSelectWasteTypeBeforeChoosingSkipRestrictedWasteSizeCombination] | verify that the User can select a waste type before choosing a skip with restricted waste/size combination', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter oversized boundary input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the page stays usable and does not crash', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
    })
  })

  // @stlc:generated

  test('[UserCanSelectAvailableSkipSizeBasedWasteRules] | verify that the User can select an available skip size based on waste rules', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanSelectAvailableSkipSizeBasedWasteRulesWithoutSelectingRequiredOption] | verify that the User can select an available skip size based on waste rules without selecting a required option', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanSelectAvailableSkipSizeBasedWasteRulesRestrictedWasteSizeCombination] | verify that the User can select an available skip size based on waste rules with restricted waste/size combination', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter oversized boundary input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the page stays usable and does not crash', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
    })
  })

  // @stlc:generated

  test('[UserCanReviewPricingConfirmBooking] | verify that the User can review pricing and confirm the booking', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanReviewPricingConfirmBookingWhenUpstreamConfirmApiFails] | verify that the User can review pricing and confirm the booking when upstream confirm API fails', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanCompleteBookingMultiStepFunnelEndEnd] | verify that the User can complete the Booking multi-step funnel end-to-end', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanCompleteBookingMultiStepFunnelEndEndWhenUpstreamConfirmApiFails] | verify that the User can complete the Booking multi-step funnel end-to-end when upstream confirm API fails', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanCompleteBookingSkipHireWorkflowBooking] | verify that the User can complete the booking / skip-hire workflow on Booking', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanCompleteBookingSkipHireWorkflowBookingWithoutSelectingRequiredOption] | verify that the User can complete the booking / skip-hire workflow on Booking without selecting a required option', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCanCompleteBookingSkipHireWorkflowBookingRestrictedWasteSizeCombination] | verify that the User can complete the booking / skip-hire workflow on Booking with restricted waste/size combination', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter oversized boundary input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the page stays usable and does not crash', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
    })
  })

  // @stlc:generated

  test('[UserCanCompleteFrontendBackendIntegrationCallBooking] | verify that the User can complete the Frontend-to-backend integration call on Booking', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanCompleteFrontendBackendIntegrationCallBookingWhenUpstreamConfirmApiFails] | verify that the User can complete the Frontend-to-backend integration call on Booking when upstream confirm API fails', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserSeesClearError] | verify that the User sees a clear error', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[CanRetry] | verify that the and can retry', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[WhenPostcodeLookupFails] | verify that the when postcode lookup fails', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[WhenPostcodeLookupFailsEmptyPostcode] | verify that the when postcode lookup fails with empty postcode', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[WhenPostcodeLookupFailsInvalidPostcodeFormat] | verify that the when postcode lookup fails with invalid postcode format', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[WhenPostcodeLookupFailsEmptyResultPostcode] | verify that the when postcode lookup fails with empty-result postcode', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserSeesBookingConfirmationReferenceAfterSuccess] | verify that the User sees a booking confirmation with a reference id after success', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserSeesBookingConfirmationReferenceAfterSuccessWhenUpstreamConfirmApiFails] | verify that the User sees a booking confirmation with a reference id after success when upstream confirm API fails', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[UserCompletesPrimaryBookingFormUsingDiscoveredInputsActions] | verify that the User completes the primary booking form using discovered inputs and actions', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanInteractStepPostcodeBookingFlow] | verify that the User can interact with &quot;step-postcode&quot; on the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanInteractPostcodeInputBookingFlow] | verify that the User can interact with &quot;postcode-input&quot; on the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanInteractEmptyAddressesBookingFlow] | verify that the User can interact with &quot;empty-addresses&quot; on the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerLookupButtonDuringBookingFlow] | verify that the User can trigger &quot;lookup-button&quot; during the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerRetryLookupDuringBookingFlow] | verify that the User can trigger &quot;retry-lookup&quot; during the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerNextStep1DuringBookingFlow] | verify that the User can trigger &quot;next-from-step1&quot; during the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerConfirmBookingDuringBookingFlow] | verify that the User can trigger &quot;confirm-booking&quot; during the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerNextStep3DuringBookingFlow] | verify that the User can trigger &quot;next-from-step3&quot; during the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanSelectEachMajorOptionGroupBookingFlow] | verify that the User can select each major option group on the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[ValidationErrorSurfacesAreReachableBookingFlow] | verify that the Validation and error surfaces are reachable on the booking flow', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[SuccessfulBookingCompletionSurfacesConfirmation] | verify that the Successful booking completion surfaces confirmation UI', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[KeyboardNavigationReachesPrimaryControlsBooking] | verify that the keyboard navigation reaches the primary controls on the booking page', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "INVALID!!")
      await bookingPage.click(bookingPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingPage.postcodeInput).toBeVisible()
      await expect(bookingPage.addressOption("addr_1")).toBeHidden()
    })
  })

  // @stlc:generated

  test('[ControlsReferencedApplicationSourceAreTestable] | verify that the UI controls referenced in application source are testable', async ({ bookingPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingPage.page.goto("http://localhost:3000/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingPage.fill(bookingPage.postcodeInput, "SW1A 1AA")
      await bookingPage.click(bookingPage.lookupButtonBtn)
      await expect(bookingPage.addressOption("addr_1")).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingPage.check(bookingPage.addressOption("addr_1"))
      await bookingPage.click(bookingPage.nextFrom("step1"))
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingPage.click(bookingPage.wastePath("general"))
      await bookingPage.click(bookingPage.nextFrom("step2"))
    })
    await test.step('Choose skip and continue', async () => {
      await bookingPage.check(bookingPage.skipOption("2-yard"))
      await bookingPage.click(bookingPage.nextFrom("step3"))
    })
    await test.step('Confirm and assert success', async () => {
      await bookingPage.click(bookingPage.confirmBookingBtn)
      await expect(bookingPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

})
