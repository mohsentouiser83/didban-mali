"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
export function useReconciliationBasis() {
  const workspace=useWorkspace();
  const scope=`${workspace.user?.id}:${workspace.company?.id}`;
  const [selection,setSelection]=useState<{scope:string;basis:"native_book"|"imported_ledger"}>();
  const moduleState=workspace.modules.data?.items.find(item=>item.key==="reconciliation");
  return {workspace,scope,basis:selection?.scope===scope?selection.basis:moduleState?.source_basis==="native_book"?"native_book":"imported_ledger",
    select:(basis:string)=>{if(basis==="native_book"||basis==="imported_ledger")setSelection({scope,basis});}};
}
