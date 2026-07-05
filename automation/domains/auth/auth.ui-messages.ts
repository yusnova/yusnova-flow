export const AuthUiMessages = {
  login: {
    emptyUsername: {
      message: /Username is required/i,
    },
    emptyPassword: {
      message: /Password is required/i,
    },
    wrongCredentials: {
      message: /do not match/i,
    },
    lockedOut: {
      message: /locked out/i,
    },
  },
} as const
