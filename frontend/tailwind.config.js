/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eef6fd',
          100: '#d6eafa',
          200: '#add4f5',
          300: '#7cbaed',
          400: '#51a1eb',
          500: '#2e8ad8',
          600: '#2070b8',
          700: '#1a5a95',
          800: '#154775',
          900: '#103859',
        },
      },
    },
  },
  safelist: [
    { pattern: /bg-primary-(50|100|200|300|400|500|600|700|800|900)/ },
    { pattern: /text-primary-(50|100|200|300|400|500|600|700|800|900)/ },
    { pattern: /border-primary-(50|100|200|300|400|500|600|700|800|900)/ },
    { pattern: /ring-primary-(100|200|300|400|500)/ },
  ],
  plugins: [],
}
