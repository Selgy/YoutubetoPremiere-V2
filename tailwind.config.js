/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4e52ff',
          hover: '#6e72ff',
        },
        background: {
          DEFAULT: '#1e2057',
          panel: '#2e2f77',
        },
        border: '#3e41a8',
        discord: '#5865F2',
        'discord-hover': '#4752C4',
      }
    }
  },
  plugins: [],
} 