import { test as baseTest } from '@core/fixtures/base.fixture'
import { BookingPage } from '@pages/booking-page'

interface BookingFixtures {
  bookingPage: BookingPage
}

export const test = baseTest.extend<BookingFixtures>({
  bookingPage: async ({ page }, use) => {
    await use(new BookingPage(page))
  },
})

export { expect } from '@playwright/test'
