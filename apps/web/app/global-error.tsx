"use client";
import { PageTitle } from "@/components/ui/page-title";
import { WarningCircleIcon as TitleIcon } from "@phosphor-icons/react";
import { yekan } from "./fonts";
import "./globals.css";

export default function GlobalError() {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={yekan.variable}
    >
      <body className="grid min-h-dvh place-items-center bg-canvas p-5 font-body text-foreground [font-synthesis:none]">
        <main className="max-w-lg rounded-dialog border border-border bg-surface p-8 text-center">
          <PageTitle icon={TitleIcon} className="justify-center">
            نمایش برنامه ممکن نشد
          </PageTitle>
        </main>
      </body>
    </html>
  );
}
