import type { Metadata } from "next";

import { AuthScreen } from "@/components/product/auth-screen";

export const metadata: Metadata = {
  title: "ساخت حساب | دیدبان مالی",
  description: "ساخت حساب کاربری و فضای کاری جدید در سامانه دیدبان مالی",
};

export default function RegisterPage() {
  return <AuthScreen initialMode="register" />;
}
