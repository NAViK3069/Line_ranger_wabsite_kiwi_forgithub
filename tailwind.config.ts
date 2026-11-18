import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // หน้ากาชาย้ายมาอยู่ที่ src/views (ตัว route จริงใน src/app แค่ import เข้าไป) — ต้องสแกนด้วย ไม่งั้นคลาสหาย
    "./src/views/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // สีธีมของโปรเจค Line Ranger
      colors: {
        "lr-gold": "#FFD700",
        "lr-orange": "#FF6B2B",
        "lr-dark": "#1A0A2E",
        "lr-purple": "#6B21A8",
        "lr-cyan": "#22D3EE",
      },
      // ฟอนต์
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
      // อนิเมชั่นพิเศษ
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        gachaReveal: {
          "0%": { transform: "scale(0) rotate(-180deg)", opacity: "0" },
          "80%": { transform: "scale(1.1) rotate(5deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        bounceIn: {
          "0%":   { transform: "scale(0.7)", opacity: "0" },
          "60%":  { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)",   opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        float: "float 3s ease-in-out infinite",
        "gacha-reveal": "gachaReveal 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
        "bounce-in": "bounceIn 0.4s ease forwards",
      },
    },
  },
  plugins: [],
};

export default config;
