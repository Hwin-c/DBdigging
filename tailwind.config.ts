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
        background: "var(--background)",
        foreground: "var(--foreground)",
        digging: {
          dark: "#0b0f17",
          card: "#121824",
          cardHover: "#182234",
          border: "#1e293b",
          neon: "#6366f1",
          cyan: "#06b6d4",
          emerald: "#10b981",
          rose: "#f43f5e",
          amber: "#f59e0b"
        }
      },
      fontFamily: {
        sans: ["Pretendard", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
