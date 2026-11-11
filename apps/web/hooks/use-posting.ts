"use client";
import { useState } from "react";
import { draftValidation } from "@/lib/accounting";
import type { InventoryPostingEvidence } from "@/lib/inventory";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
export interface PostingPreview {
  draft_id: string;
  expected_version: number;
  digest: string;
  total_debit: string;
  total_credit: string;
  snapshot: {
    description: string;
    date: string;
    inventory?: InventoryPostingEvidence;
    lines: {
      account_id: string;
      code: string;
      name: string;
      party_id: string;
      debit: string;
      credit: string;
    }[];
  };
}
export function usePosting(onPosted: () => void) {
  const workspace = useWorkspace();
  const command = useCommand();
  const [reviews, setReviews] = useState<PostingPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError>();
  const [selected, setSelected] = useState<string[]>([]);
  async function review(ids: string[]) {
    if (!ids.length || loading || command.busy) return;
    setLoading(true);
    setError(undefined);
    setReviews([]);
    try {
      const result = await Promise.all(
        ids.map((id) =>
          api<PostingPreview>(
            workspace.companyPath(`accounting/drafts/${id}/posting-preview`)!,
          ),
        ),
      );
      const stockBuckets = result.flatMap(({ snapshot }) => snapshot.inventory
        ? [`${snapshot.inventory.item_id}:${snapshot.inventory.warehouse_id}`]
        : [],
      );
      if (new Set(stockBuckets).size !== stockBuckets.length) {
        setError(new ApiError(
          409,
          "سندهای یک کالا در یک انبار را جداگانه تأیید کنید.",
          "inventory_batch_overlap",
        ));
        return;
      }
      setReviews(result);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e
          : new ApiError(0, "پیش‌نمایش دریافت نشد.", "unknown"),
      );
    } finally {
      setLoading(false);
    }
  }
  function post() {
    if (!reviews.length) return;
    void command.run(
      workspace.companyPath("accounting/postings"),
      {
        body: {
          items: reviews.map(({ draft_id, expected_version, digest }) => ({
            draft_id,
            expected_version,
            digest,
          })),
        },
      },
      () => {
        setReviews([]);
        setSelected([]);
        onPosted();
      },
      "اسناد منتخب ثبت نهایی شدند.",
    );
  }
  return {
    total: draftValidation({
      unit: "IRR",
      period_id: "preview",
      date: "preview",
      description: "preview",
      lines: reviews.flatMap((item) => item.snapshot.lines),
    }).totalDebit,
    reviews,
    selected,
    loading,
    error,
    command,
    review,
    post,
    close: () => {
      if (!command.busy) setReviews([]);
    },
    toggle: (id: string, checked: boolean) =>
      setSelected((prev) =>
        checked
          ? [...new Set([...prev, id])]
          : prev.filter((value) => value !== id),
      ),
  };
}
