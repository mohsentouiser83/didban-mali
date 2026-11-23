import localFont from "next/font/local";

export const yekan = localFont({
  src: [
    { path: "../public/fonts/IRANYekanX-Regular.ttf", weight: "400" },
    { path: "../public/fonts/IRANYekanX-Medium.ttf", weight: "500" },
    { path: "../public/fonts/IRANYekanX-Bold.ttf", weight: "700" },
    { path: "../public/fonts/IRANYekanX-ExtraBold.ttf", weight: "800" },
  ],
  variable: "--font-yekan",
  display: "swap",
  adjustFontFallback: false,
});
