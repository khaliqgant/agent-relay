/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './react-components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme colors (default)
        bg: {
          primary: '#1a1d21',
          secondary: '#222529',
          tertiary: '#19171d',
          hover: 'rgba(255, 255, 255, 0.06)',
          active: 'rgba(255, 255, 255, 0.1)',
        },
        text: {
          primary: '#d1d2d3',
          secondary: '#ababad',
          muted: '#8d8d8e',
          inverse: '#1a1d21',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.1)',
          light: 'rgba(255, 255, 255, 0.06)',
          dark: 'rgba(255, 255, 255, 0.15)',
        },
        accent: {
          DEFAULT: '#1264a3',
          hover: '#0d4f82',
          light: 'rgba(18, 100, 163, 0.15)',
        },
        success: {
          DEFAULT: '#2bac76',
          light: 'rgba(43, 172, 118, 0.15)',
        },
        warning: {
          DEFAULT: '#e8a427',
          light: 'rgba(232, 164, 39, 0.15)',
        },
        error: {
          DEFAULT: '#e01e5a',
          light: 'rgba(224, 30, 90, 0.15)',
        },
        // Sidebar colors
        sidebar: {
          bg: '#1a1a2e',
          border: '#2a2a3e',
          hover: '#3a3a4e',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['SF Mono', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: '11px',
        sm: '13px',
        base: '14px',
        lg: '15px',
        xl: '16px',
        '2xl': '18px',
      },
      spacing: {
        sidebar: '280px',
        header: '52px',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
        md: '0 1px 3px rgba(0, 0, 0, 0.1)',
        lg: '0 4px 6px rgba(0, 0, 0, 0.1)',
        xl: '0 10px 15px rgba(0, 0, 0, 0.1)',
        modal: '0 16px 70px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        spin: 'spin 1s linear infinite',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 150ms ease',
        'slide-up': 'slideUp 200ms ease',
        'slide-down': 'slideDown 200ms ease',
        'kill-pulse': 'killPulse 0.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        killPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [],
};
