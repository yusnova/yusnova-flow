import { z } from 'zod'

export const errorResponseSchema = z.object({
  message: z.string().min(1),
})
