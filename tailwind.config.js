/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Khushu App design tokens — minimal, calm, low stimulation
        sand: {
          50:  '#FAF7F2',
          100: '#F9F5EE',
          200: '#EFE8D8',
          300: '#DDD0BA',
        },
        sage: {
          400: '#7A9E7A',
          500: '#6B8F6B',
          600: '#5A7A5A',
          700: '#4A6A4A',
        },
        ink: {
          100: '#C8C0B4',
          300: '#9B9189',
          500: '#6B6360',
          700: '#3D3A37',
          900: '#1A1917',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
