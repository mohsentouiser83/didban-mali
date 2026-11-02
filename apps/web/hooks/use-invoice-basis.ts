"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
export function useInvoiceBasis() {
  const workspace=useWorkspace();
  const setup=useResource<{mode:"primary"|"analysis"}>(workspace.companyPath("accounting/setup"));
  const scope=`${workspace.user?.id}:${workspace.company?.id}`;
  const [selected,setSelected]=useState<{scope:string;basis:"native_invoice"|"imported_invoice"}>();
  return {workspace,setup,scope,basis:selected?.scope===scope?selected.basis:setup.data?.mode==="primary"?"native_invoice":"imported_invoice",select:(basis:string)=>{if(basis==="native_invoice"||basis==="imported_invoice")setSelected({scope,basis});}};
}
