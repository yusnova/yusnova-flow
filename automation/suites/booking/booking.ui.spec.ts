import { test, expect } from '@domains/booking/booking.fixture'

test.describe('[BookingFlowPage] Happy path', () => {
  // @stlc:generated
  test('[CompletingEveryStepConfirmsBooking] | verify that completing every step confirms the booking', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

})
test.describe('[BookingFlowPage] Validation', () => {
  // @stlc:generated
  test('[SubmittingFirstStepEmptyInputDoesNotAdvanceFlow] | verify that submitting the first step with empty input does not advance the flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Submit without entering required input', async () => {
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingFlowPage.postcodeInput).toBeVisible()
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeHidden()
    })
  })

  // @stlc:generated

  test('[SubmittingFirstStepInvalidInputDoesNotAdvanceFlow] | verify that submitting the first step with invalid input does not advance the flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "INVALID!!")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingFlowPage.postcodeInput).toBeVisible()
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeHidden()
    })
  })

  // @stlc:generated

  test('[OversizedBoundaryInputKeepsFirstStepUsable] | verify that oversized boundary input keeps the first step usable', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter oversized boundary input and submit', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
    })
    await test.step('Assert the page stays usable and does not crash', async () => {
      await expect(bookingFlowPage.postcodeInput).toBeVisible()
    })
  })

})
test.describe('[BookingFlowPage] Edge cases', () => {
  // @stlc:generated
  test('[UserCompletesPrimaryBookingFormUsingDiscoveredInputsActions] | verify that the User completes the primary booking form using discovered inputs and actions', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanInteractStepPostcodeBookingFlow] | verify that the User can interact with &quot;step-postcode&quot; on the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanInteractPostcodeInputBookingFlow] | verify that the User can interact with &quot;postcode-input&quot; on the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanInteractEmptyAddressesBookingFlow] | verify that the User can interact with &quot;empty-addresses&quot; on the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerLookupButtonDuringBookingFlow] | verify that the User can trigger &quot;lookup-button&quot; during the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerRetryLookupDuringBookingFlow] | verify that the User can trigger &quot;retry-lookup&quot; during the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerNextStep1DuringBookingFlow] | verify that the User can trigger &quot;next-from-step1&quot; during the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerConfirmBookingDuringBookingFlow] | verify that the User can trigger &quot;confirm-booking&quot; during the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanTriggerNextStep3DuringBookingFlow] | verify that the User can trigger &quot;next-from-step3&quot; during the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[UserCanSelectEachMajorOptionGroupBookingFlow] | verify that the User can select each major option group on the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[ValidationErrorSurfacesAreReachableBookingFlow] | verify that the Validation and error surfaces are reachable on the booking flow', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "INVALID!!")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingFlowPage.postcodeInput).toBeVisible()
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeHidden()
    })
  })

  // @stlc:generated

  test('[SuccessfulBookingCompletionSurfacesConfirmation] | verify that the Successful booking completion surfaces confirmation UI', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

  // @stlc:generated

  test('[KeyboardNavigationReachesPrimaryControlsBooking] | verify that the keyboard navigation reaches the primary controls on the booking page', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter invalid input and submit', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "INVALID!!")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
    })
    await test.step('Assert the flow did not advance', async () => {
      await expect(bookingFlowPage.postcodeInput).toBeVisible()
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeHidden()
    })
  })

  // @stlc:generated

  test('[ControlsReferencedApplicationSourceAreTestable] | verify that the UI controls referenced in application source are testable', async ({ bookingFlowPage }) => {
    await test.step('Navigate to page', async () => {
      await bookingFlowPage.page.goto("/")
    })
    await test.step('Enter details and start the flow', async () => {
      await bookingFlowPage.fill(bookingFlowPage.postcodeInput, "SW1A 1AA")
      await bookingFlowPage.click(bookingFlowPage.lookupButtonBtn)
      await expect(bookingFlowPage.addressOptionAddr1Radio).toBeVisible({ timeout: 15_000 })
    })
    await test.step('Choose addr and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.addressOptionAddr1Radio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep1Btn)
    })
    await test.step('Choose GeneralMixed household and continue', async () => {
      await bookingFlowPage.click(bookingFlowPage.wastePathGeneralBtn)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep2Btn)
    })
    await test.step('Choose skip and continue', async () => {
      await bookingFlowPage.check(bookingFlowPage.skipOption2YardRadio)
      await bookingFlowPage.click(bookingFlowPage.nextFromStep3Btn)
    })
    await test.step('Confirm and assert success', async () => {
      await bookingFlowPage.click(bookingFlowPage.confirmBookingBtn)
      await expect(bookingFlowPage.page).toHaveURL(/.+/, { timeout: 15_000 })
    })
  })

})
