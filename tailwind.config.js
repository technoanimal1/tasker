/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#FFF050',
          dark: '#E6D625',
        },
        // Accent — used for active states and primary actions. White buttons
        // (dark text) on the dark UI; tints/borders/rings read as subtle white.
        accent: {
          DEFAULT: '#ffffff',
          dark: '#e6e6e6',
        },
      },
    },
  },
  plugins: [],
}
