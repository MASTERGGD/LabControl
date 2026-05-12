/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          bg:              '#0f172a',
          surface:         '#1e293b',
          border:          '#334155',
          blue:            '#3b82f6',
          'blue-hover':    '#2563eb',
          emerald:         '#10b981',
          'emerald-hover': '#059669',
        },
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        glass:    '0 8px 32px 0 rgba(0,0,0,0.36)',
        glow:     '0 0 20px rgba(59,130,246,0.35)',
        'glow-em':'0 0 20px rgba(16,185,129,0.35)',
      },
    },
  },
  plugins: [],
};
