export type LoginRequest = {
  username?: string
  email?: string
  password?: string
  expiresInMins?: number
}

export type RefreshRequest = {
  refreshToken: string
  expiresInMins?: number
}

export type LoginResponse = {
  accessToken: string
  refreshToken: string
  id: number
  username: string
  email: string
}

export type RefreshResponse = {
  accessToken: string
  refreshToken: string
}

export type ErrorResponse = {
  message: string
}

export type ProductListResponse = {
  products: unknown[]
  total: number
  skip: number
  limit: number
}

export type CreateProductRequest = {
  title: string
  price: number
  stock?: number
  brand?: string
  category?: string
  description?: string
}

export type CreateProductResponse = {
  id: number
  title: string
  price: number
  stock?: number
  brand?: string
  category?: string
  description?: string
}
