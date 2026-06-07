/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        emergency: {
          fire: '#ef4444',     // Red for fire
          medical: '#3b82f6',  // Blue for medical
          corridor: '#10b981', // Green for corridor
          warning: '#f59e0b',  // Orange for warning
        }
      }
    },
  },
  plugins: [],
}
