import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";
const yekan = localFont({
  src: [
    {
      path: "../../../assets/fonts/IRANYekanX-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../assets/fonts/IRANYekanX-Medium.ttf",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-yekan",
  display: "swap",
});
const anjoman = localFont({
  src: "../../../assets/fonts/AnjomanMax-Medium.woff2",
  weight: "500",
  variable: "--font-anjoman",
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "دیدبان مالی", template: "%s | دیدبان مالی" },
  description: "فضای مالی سازمان",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${yekan.variable} ${anjoman.variable}`}
    >
      <body className="bg-background font-sans text-sm leading-7 text-foreground antialiased [font-synthesis:none] selection:bg-accent selection:text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
