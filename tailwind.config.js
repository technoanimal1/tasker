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
        // Figma-like accent — used for active states and primary actions.
        accent: {
          DEFAULT: '#0d99ff',
          dark: '#0b87e0',
        },
      },
    },
  },
  plugins: [],
}
