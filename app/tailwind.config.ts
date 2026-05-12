import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Starbucks-inspired palette matching the spec and PWA manifest
        green: {
          starbucks: "#00704A",
          dark: "#1E3932",
          mid: "#2d5a3d",
        },
        gold: {
          DEFAULT: "#CBA258",
          light: "#f5edd8",
        },
        cream: "#FAF7F2",
      },
    },
  },
  plugins: [],
};

export default config;
