import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

import { ThemeProvider } from "@/components/theme-provider";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const iranYekan = localFont({
  src: [
    {
      path: "../public/fonts/IRANYekanX-Regular.ttf",
      weight: "100",
      style: "normal",
    },
    {
      path: "../public/fonts/IRANYekanX-Regular.ttf",
      weight: "200",
      style: "normal",
    },
    {
      path: "../public/fonts/IRANYekanX-Regular.ttf",
      weight: "300",
      style: "normal",
    },
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
    {
      path: "../public/fonts/IRANYekanX-Bold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/IRANYekanX-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/IRANYekanX-ExtraBold.ttf",
      weight: "800",
      style: "normal",
    },
    {
      path: "../public/fonts/IRANYekanX-ExtraBold.ttf",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["Tahoma", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: "دیدبان مالی",
  description: "لایه هوشمندی، کنترل و تحلیل مالی برای کسب‌وکارهای ایرانی",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${iranYekan.variable} font-sans antialiased`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className={`${iranYekan.className} ds-root font-sans antialiased`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <DirectionProvider dir="rtl">
            <TooltipProvider delayDuration={250}>
              {children}
              <Toaster position="top-center" richColors closeButton />
            </TooltipProvider>
          </DirectionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
