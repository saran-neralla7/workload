/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'gvp-maroon': '#800000',
        'gvp-navy': '#0B2545',
        'gvp-gold': '#DAA520',
        'gvp-light': '#F8F9FA',
      },
    },
  },
  plugins: [],
}
