import type { Metadata } from "next";
import type { ReactNode } from "react";

import { LegacyAppearanceCleanup } from "@/components/legacy-appearance-cleanup";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: "دیدبان مالی",
  description: "لایه هوشمندی، کنترل و تحلیل مالی برای کسب‌وکارهای ایرانی",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className="font-sans antialiased"
      data-scroll-behavior="smooth"
    >
      <head>
        <link
          rel="preload"
          href="/fonts/IRANYekanX-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body className="ds-root font-sans antialiased">
        <LegacyAppearanceCleanup />
        <DirectionProvider dir="rtl">
          <TooltipProvider delayDuration={250}>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </TooltipProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
