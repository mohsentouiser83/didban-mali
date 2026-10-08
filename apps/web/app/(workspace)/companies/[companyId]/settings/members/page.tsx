"use client";
import { MembersPanel } from "@/components/product/members-panel";
import { PageHeader } from "@/components/ui/financial";
import { useWorkspace } from "@/components/product/workspace-provider";
export default function CompanyMembersPage() {
  const { company, user } = useWorkspace();
  return (
    <div className="pp-page pp-settings" dir="rtl">
      <PageHeader
        title="اعضای تیم و دسترسی‌ها"
        description="اعضای شرکت و نقش هر نفر در بررسی و مدیریت اطلاعات مالی را ببینید."
      />
      <MembersPanel company={company} currentUserId={user.id} />
    </div>
  );
}
