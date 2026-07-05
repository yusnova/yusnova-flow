import { z } from 'zod'

export const loginResponseSchema = z.object({
  accessToken: z.string().min(10),
  refreshToken: z.string().min(10),
  id: z.number(),
  username: z.string(),
  email: z.email(),
})

export const refreshResponseSchema = z.object({
  accessToken: z.string().min(10),
  refreshToken: z.string().min(10),
})
