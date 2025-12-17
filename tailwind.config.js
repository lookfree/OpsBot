/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./front/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 暗色主题
        dark: {
          bg: {
            primary: '#1e1e1e',
            secondary: '#1e1e1e',
            sidebar: '#1e1e1e',
            hover: '#2a2a2a',
            selected: '#1e3a5f',
          },
          text: {
            primary: '#ffffff',
            secondary: '#a0a0a0',
            disabled: '#666666',
          },
          border: '#2a2a2a',
        },
        // 亮色主题
        light: {
          bg: {
            primary: '#ffffff',
            secondary: '#ffffff',
            sidebar: '#ffffff',
            hover: '#eeeeee',
            selected: '#e0f2fe',
          },
          text: {
            primary: '#1a1a1a',
            secondary: '#666666',
            disabled: '#999999',
          },
          border: '#e5e5e5',
        },
        // 强调色
        accent: {
          primary: '#3b82f6',
          hover: '#60a5fa',
          dark: '#2563eb',
        },
        // 状态色
        status: {
          success: '#22c55e',
          warning: '#eab308',
          error: '#ef4444',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Fira Code"',
          '"SF Mono"',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        xs: '12px',
        sm: '13px',
        base: '14px',
        lg: '16px',
        xl: '18px',
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
}
