"use client";
import { FilesIcon, XIcon } from "@phosphor-icons/react";
import type { Metric } from "@/lib/api";
import { amount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
} from "@/components/ui/popover";
import { EvidenceList } from "./evidence-list";
export function AssistantFacts({
  facts,
  unit,
}: {
  facts: Metric[];
  unit: "IRR" | "TOMAN";
}) {
  return (
    <div className="mt-3 divide-y divide-border">
      {facts.map((fact, index) => (
        <div
          key={fact.metric_key || index}
          className="py-3 first:pt-0 last:pb-0"
        >
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1 text-xs leading-6">
              {fact.label || "شاخص"}
            </span>
            <span className="whitespace-nowrap text-xs tabular-nums">
              {amount(fact.value, unit)} {unit === "IRR" ? "ریال" : "تومان"}
            </span>
          </div>
          {fact.value == null && (
            <p className="mt-1 text-xs leading-6 text-warning">
              {fact.reason ||
                fact.action ||
                "منبع کافی برای این شاخص موجود نیست."}
            </p>
          )}
          {!!fact.evidence_refs?.length && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="mt-1 min-h-11 px-1 text-xs">
                  <FilesIcon size={15} aria-hidden />
                  شواهد
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 max-h-[60dvh] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-medium">{fact.label || "شواهد شاخص"}</h3>
                  <PopoverClose asChild>
                    <Button
                      variant="ghost"
                      className="size-11 p-0"
                      aria-label="بستن شواهد"
                    >
                      <XIcon size={18} />
                    </Button>
                  </PopoverClose>
                </div>
                <EvidenceList evidence={fact.evidence_refs || []} />
              </PopoverContent>
            </Popover>
          )}
        </div>
      ))}
    </div>
  );
}
