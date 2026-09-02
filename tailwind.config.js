/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // thumbs.store design system — see docs/DESIGN_SYSTEM.md.
      // Monochrome first: surfaces are black and near-black, everything else is
      // white at a few fixed opacities. Colour is rationed.
      colors: {
        page: '#000000', // the only page background
        panel: '#121212', // card fill
        deep: '#0a0a0a', // wells: media stages, canvas, dashboard
        ring: '#222222', // card & table borders (1px)

        text: '#ffffff',
        muted: 'rgb(255 255 255 / 0.62)', // body copy
        dim: 'rgb(255 255 255 / 0.4)', // labels, captions

        // Brand accent. Rationed: one per screen — a badge, the primary
        // button's hover, a LIVE/DRAFT pill. Never body text, never borders.
        yellow: '#fef150',
        // Selection / interactive accent, tools only (never marketing surfaces).
        blue: '#2c5cff',
        green: '#7ed321', // success, "free", 200 OK

        // Active UI state is white fill / black text — never yellow.
        accent: { DEFAULT: '#ffffff', dark: '#e6e6e6' },
        brand: { DEFAULT: '#fef150', dark: '#e6d625' },
      },
      borderRadius: {
        pill: '999px', // buttons, chips, badges, toggles
        card: '24px', // standard cards, media panels
        hero: '33px', // biggest containers
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
