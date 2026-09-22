import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canfy: {
          50: '#effcf4',
          100: '#d9f8e4',
          500: '#09bb5a',
          600: '#079d4c',
          700: '#087d40',
          900: '#07502c',
        },
      },
      boxShadow: {
        card: '0 18px 50px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
