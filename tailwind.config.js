/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Khushu App design tokens — minimal, calm, low stimulation
        white: 'rgb(var(--color-white) / <alpha-value>)',
        'pure-white': '#FFFFFF',
        sand: {
          50:  'rgb(var(--color-sand-50) / <alpha-value>)',
          100: 'rgb(var(--color-sand-100) / <alpha-value>)',
          200: 'rgb(var(--color-sand-200) / <alpha-value>)',
          300: 'rgb(var(--color-sand-300) / <alpha-value>)',
        },
        sage: {
          400: '#7A9E7A',
          500: '#6B8F6B',
          600: '#5A7A5A',
          700: '#4A6A4A',
        },
        ink: {
          100: 'rgb(var(--color-ink-100) / <alpha-value>)',
          300: 'rgb(var(--color-ink-300) / <alpha-value>)',
          400: 'rgb(var(--color-ink-400) / <alpha-value>)',
          500: 'rgb(var(--color-ink-500) / <alpha-value>)',
          700: 'rgb(var(--color-ink-700) / <alpha-value>)',
          900: 'rgb(var(--color-ink-900) / <alpha-value>)',
        },
        red: {
          50: 'rgb(var(--color-red-50) / <alpha-value>)',
          400: 'rgb(var(--color-red-400) / <alpha-value>)',
          500: 'rgb(var(--color-red-500) / <alpha-value>)',
        },
        yellow: {
          500: 'rgb(var(--color-yellow-500) / <alpha-value>)',
          600: 'rgb(var(--color-yellow-600) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
