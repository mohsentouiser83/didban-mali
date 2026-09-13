"use client";

import { ImportsPanel } from "@/components/product/imports-panel";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ImportsPage() { const { company } = useWorkspace(); return <ImportsPanel company={company} />; }
