import { NavigationProgress } from "@/components/ui/navigation-progress";
import { Toaster } from "@/components/ui/sonner";
import type { Metadata } from "next";
import { yekan } from "./fonts";
import "./globals.css";

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
      className={yekan.variable}
    >
      <body className="min-h-dvh bg-canvas font-body text-sm font-normal leading-7 text-foreground antialiased [font-synthesis:none] selection:bg-primary-soft selection:text-primary [&_*]:caret-primary">
        <NavigationProgress />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
