/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
    './store/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: '#F4F6F2',
        surface: '#FFFFFF',
        line: '#DFE6E0',
        ink: {
          DEFAULT: '#0F1F1A',
          muted: '#56655F',
          faint: '#84938D',
        },
        forest: {
          50: '#EDF7F1',
          100: '#D7EDE0',
          200: '#B0DCC2',
          300: '#7FC49E',
          400: '#4BA678',
          500: '#24875A',
          600: '#146B45',
          700: '#0F5136',
          800: '#0A3D2A',
          900: '#06301F',
          950: '#04231A',
        },
        amber: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#F59E0B',
          500: '#D97706',
          600: '#B45309',
          700: '#92400E',
        },
        crimson: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#DC2626',
          600: '#BE123C',
          700: '#9F1239',
        },
      },
      borderRadius: {
        '4xl': '32px',
      },
    },
  },
  plugins: [],
};
