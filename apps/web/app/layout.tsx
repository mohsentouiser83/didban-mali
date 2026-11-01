import { Toaster } from "@/components/ui/sonner";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const yekan = localFont({
  src: [
    {
      path: "../public/fonts/IRANYekanX-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/IRANYekanX-Medium.ttf",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-yekan",
  display: "swap",
});
const anjoman = localFont({
  src: "../public/fonts/AnjomanMax-Medium.woff2",
  weight: "500",
  variable: "--font-anjoman",
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "دیدبان مالی", template: "%s | دیدبان مالی" },
  description: "تصویر روشن مالی، با شواهد قابل پیگیری",
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
      <body className="min-h-dvh bg-canvas font-body text-sm font-normal leading-7 text-foreground antialiased [font-synthesis:none] selection:bg-primary-soft selection:text-primary [&_*]:caret-primary">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
