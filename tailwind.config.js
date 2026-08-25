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
      },
    },
  },
  plugins: [],
}
