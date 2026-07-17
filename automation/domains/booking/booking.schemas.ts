import { z } from 'zod'

// AUTO-GENERATED response schemas for the booking API.
// Derived from core/api/generated/model/booking.ts (Foundry contract).
// Wired into suites/booking/booking.api.spec.ts via ApiAssertions.assertSchema.

export const wasteTypesResponseSchema = z.object({
  ok: z.boolean(),
}).loose()

export const skipsResponseSchema = z.object({
  skips: z.array(z.unknown()),
}).loose()

export const postcodeLookupResponseSchema = z.object({
  postcode: z.string(),
  addresses: z.array(z.unknown()),
}).loose()

export const bookingConfirmResponseSchema = z.object({
  status: z.string(),
  bookingId: z.string().min(1),
}).loose()

