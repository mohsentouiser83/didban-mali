"use client";

import { MembersPanel } from "@/components/product/members-panel";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function CompanyMembersPage() { const { company, user } = useWorkspace(); return <MembersPanel company={company} currentUserId={user.id} />; }
