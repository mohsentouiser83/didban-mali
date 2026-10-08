"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/** A stable working surface keeps data and controls in place during navigation. */
export function ProductPageFrame({
  children,
  notice,
}: {
  children: ReactNode;
  notice?: ReactNode;
}) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const body = bodyRef.current;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    if (!body || motionPreference.matches || typeof body.animate !== "function")
      return;
    const animation = body.animate(
      [
        { transform: "scale(.975)", transformOrigin: "top right" },
        { transform: "scale(1)", transformOrigin: "top right" },
      ],
      { duration: 200, delay: 0, easing: "cubic-bezier(.22, 1, .36, 1)" },
    );
    const stopOnReducedMotion = () => {
      if (motionPreference.matches) {
        animation.cancel();
      }
    };
    motionPreference.addEventListener("change", stopOnReducedMotion);
    return () => {
      animation.cancel();
      motionPreference.removeEventListener("change", stopOnReducedMotion);
    };
  }, [pathname]);

  return (
    <div id="workspace-content" className="product-page-frame" tabIndex={-1}>
      {notice && <div className="product-page-notice">{notice}</div>}
      <div ref={bodyRef} className="product-page-body">
        {children}
      </div>
    </div>
  );
}
