"use client";
import { PageTitle } from "@/components/ui/page-title";
import { MagnifyingGlassIcon as TitleIcon } from "@phosphor-icons/react";
import { ButtonLink } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <div className="text-center">
        <PageTitle icon={TitleIcon} className="justify-center">
          این صفحه پیدا نشد
        </PageTitle>
        <ButtonLink href="/" variant="secondary" className="mt-6">
          بازگشت به خلاصه مالی
        </ButtonLink>
      </div>
    </main>
  );
}
