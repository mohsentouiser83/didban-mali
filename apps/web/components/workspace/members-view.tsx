"use client";
import { UsersThreeIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useMemberManagement } from "@/hooks/use-member-management";
import { useWorkspace } from "@/hooks/workspace";
import { NoCompany, PageHeader } from "./page-parts";
import { MembersList } from "./members-list";
import { MemberAddDrawer } from "./member-add-drawer";
import { MemberAccessDrawer } from "./member-access-drawer";
export function MembersView() {
  const w = useWorkspace();
  return w.company ? (
    <MemberWorkspace key={`${w.user?.id}:${w.company.id}`} />
  ) : (
    <NoCompany />
  );
}
function MemberWorkspace() {
  const c = useMemberManagement();
  return (
    <>
      <PageHeader
        title="اعضا و دسترسی"
        icon={UsersThreeIcon}
        action={
          c.workspace.company?.role === "owner" && (
            <Button onClick={c.openAdd}>افزودن عضو</Button>
          )
        }
      />
      <MembersList c={c} />
      <MemberAddDrawer c={c} />
      <MemberAccessDrawer c={c} />
    </>
  );
}
