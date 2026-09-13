"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={isDark ? "فعال‌کردن تم روشن" : "فعال‌کردن تم تاریک"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      suppressHydrationWarning
    >
      <span className="relative grid size-4 place-items-center" aria-hidden="true">
        <Sun className="absolute scale-[0.25] -rotate-45 opacity-0 blur-[4px] transition-[opacity,filter,scale,rotate] duration-200 [transition-timing-function:cubic-bezier(0.2,0,0,1)] dark:scale-100 dark:rotate-0 dark:opacity-100 dark:blur-0" />
        <Moon className="scale-100 rotate-0 opacity-100 blur-0 transition-[opacity,filter,scale,rotate] duration-200 [transition-timing-function:cubic-bezier(0.2,0,0,1)] dark:scale-[0.25] dark:rotate-45 dark:opacity-0 dark:blur-[4px]" />
      </span>
    </Button>
  );
}
