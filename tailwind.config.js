/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        smart: {
          kaspi: '#D4AF37',
          freedom: '#00A86B',
          halyk: '#FFC107'
        }
      },
      boxShadow: {
        glass: '0 18px 45px rgba(15, 23, 42, 0.55)'
      },
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: []
};

