export const ProductsApiErrors = {
  create: {
    invalidTitle: {
      status: 400 as const,
      message: /title/i,
    },
    invalidPrice: {
      status: 400 as const,
      message: /price/i,
    },
  },
} as const
