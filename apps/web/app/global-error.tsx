"use client";
import { PageTitle } from "@/components/ui/page-title";
import { WarningCircleIcon as TitleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import localFont from "next/font/local";
import "./globals.css";
const yekan = localFont({
  src: [
    { path: "../public/fonts/IRANYekanX-Regular.ttf", weight: "400" },
    { path: "../public/fonts/IRANYekanX-Medium.ttf", weight: "500" },
  ],
  variable: "--font-yekan",
});
const anjoman = localFont({
  src: "../public/fonts/AnjomanMax-Medium.woff2",
  weight: "500",
  variable: "--font-anjoman",
});
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${yekan.variable} ${anjoman.variable}`}
    >
      <body className="grid min-h-dvh place-items-center bg-canvas p-5 font-body text-foreground">
        <main className="max-w-lg rounded-dialog border border-border bg-surface p-8 text-center">
          <PageTitle icon={TitleIcon} className="justify-center">
            نمایش برنامه ممکن نشد
          </PageTitle>
          <p className="mt-3 text-sm text-muted">
            برای بازیابی صفحه دوباره تلاش کنید.
          </p>
          <Button onClick={retry} className="mt-6">
            تلاش دوباره
          </Button>
        </main>
      </body>
    </html>
  );
}
