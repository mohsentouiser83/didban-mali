import Link from "next/link";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
export default function Page() {
  return (
    <main className="mx-auto max-w-xl p-5 pt-20">
      <EmptyState
        title="صفحه پیدا نشد"
        action={
          <Button asChild>
            <Link href="/companies">بازگشت به شرکت‌ها</Link>
          </Button>
        }
      />
    </main>
  );
}
