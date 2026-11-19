"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Top navigation indicator bar providing immediate feedback during page transitions.
 * Smoothly animates along the top edge of the viewport in primary brand color.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);
  const [status, setStatus] = useState<"idle" | "navigating" | "completing">("idle");
  const [progress, setProgress] = useState(0);

  // When pathname changes while navigating, mark completing
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      if (status === "navigating") {
        const frame = requestAnimationFrame(() => {
          setStatus("completing");
          setProgress(100);
        });
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [pathname, status]);

  // When completing, fade out and reset to idle after transition
  useEffect(() => {
    if (status === "completing") {
      const timer = setTimeout(() => {
        setStatus("idle");
        setProgress(0);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Intercept clicks on internal navigation links
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Ignore modified clicks (cmd, ctrl, shift, alt) or non-left clicks
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      try {
        const targetUrl = new URL(anchor.href, window.location.href);

        // Only handle internal navigation to a different path
        if (
          targetUrl.origin === window.location.origin &&
          targetUrl.pathname !== pathname
        ) {
          setStatus("navigating");
          setProgress(25);
        }
      } catch {
        // Ignore invalid URL parse errors
      }
    };

    const handleNavStart = () => {
      setStatus("navigating");
      setProgress(25);
    };

    document.addEventListener("click", handleClick, { capture: true });
    window.addEventListener("didban:navigation-start", handleNavStart);

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("didban:navigation-start", handleNavStart);
    };
  }, [pathname]);

  // Trickle progress only while actively navigating
  useEffect(() => {
    if (status !== "navigating") return;

    const interval = setInterval(() => {
      setProgress((current) => {
        if (current >= 85) return current;
        const step = (85 - current) * 0.2;
        return Math.min(current + Math.max(step, 2), 85);
      });
    }, 150);

    return () => clearInterval(interval);
  }, [status]);

  if (status === "idle") return null;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-label="بارگذاری صفحه"
      className="pointer-events-none fixed inset-x-0 top-0 z-100 h-[2.5px] bg-transparent motion-reduce:hidden"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_#5556de80] transition-[width,opacity] duration-200 ease-interface"
        style={{
          width: `${progress}%`,
          opacity: status === "completing" ? 0 : 1,
        }}
      />
    </div>
  );
}
