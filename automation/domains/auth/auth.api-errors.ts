export const AuthApiErrors = {
  login: {
    invalidCredentials: {
      status: 400 as const,
      message: 'Invalid credentials',
    },
    missingCredentials: {
      status: 400 as const,
      message: 'Username and password required',
    },
  },
  refresh: {
    expiredToken: {
      status: 401 as const,
      message: /expired/i,
    },
  },
} as const
