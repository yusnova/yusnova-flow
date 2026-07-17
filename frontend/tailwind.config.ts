import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{js,ts,tsx}", "./components/**/*.{js,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        surface: { DEFAULT: "#0f1419", muted: "#1a222d", border: "#2a3544" },
        accent: { DEFAULT: "#3b82f6", hover: "#2563eb" },
      },
    },
  },
  plugins: [],
}

export default config
