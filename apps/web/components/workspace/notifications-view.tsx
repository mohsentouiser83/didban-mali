"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/ui/content-states";

export function NotificationsView() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return <LoadingState label="در حال بازگشت به صفحه اصلی..." />;
}
