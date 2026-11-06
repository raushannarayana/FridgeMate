export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { brand: { 50: "#f0fdf4", 100: "#dcfce7", 500: "#22c55e", 600: "#16a34a", 700: "#15803d" }, ink: "#1c2420" },
    fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
  } }, plugins: [],
};
