import { test as baseTest } from '@core/fixtures/base.fixture'
import { BookingFlowPage } from '@pages/booking-flow-page'

interface BookingFixtures {
  bookingFlowPage: BookingFlowPage
}

export const test = baseTest.extend<BookingFixtures>({
  bookingFlowPage: async ({ page }, use) => {
    await use(new BookingFlowPage(page))
  },
})

export { expect } from '@playwright/test'
