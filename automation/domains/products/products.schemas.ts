import { z } from 'zod'

export const createProductRequestSchema = z.object({
  title: z.string().min(1),
  price: z.number().positive(),
  stock: z.number().int().nonnegative().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
})

export const createProductResponseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  price: z.number(),
  stock: z.number().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
})

export const productListResponseSchema = z.object({
  products: z.array(z.unknown()),
  total: z.number(),
  skip: z.number(),
  limit: z.number(),
})
