import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
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
    <html lang="fa" dir="rtl" className="antialiased" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
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
