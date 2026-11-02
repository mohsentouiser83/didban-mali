"use client";
import { useState } from "react";
import { listItems, type ResourceList } from "@/lib/api";
import { useWorkspace } from "./workspace";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import type {
  ConsolidationComparison,
  ConsolidationApprovalPreview,
  ConsolidationApproval,
  ConsolidationDraft,
  ConsolidationSources,
  IntercompanyMapping,
} from "@/lib/consolidation";
import { emptyPair } from "@/lib/consolidation";
import { amount, displayDate } from "@/lib/utils";
export function useConsolidation() {
  const workspace = useWorkspace(),
    command = useCommand();
  const history = usePagedResource<ConsolidationComparison>(
    workspace.companyPath("company-groups/runs/history"),
  );
  const drafts = usePagedResource<ConsolidationDraft>(
    workspace.companyPath("consolidation/drafts"),
  );
  const [comparison, setComparison] = useState<ConsolidationComparison | null>(
    null,
  );
  const sources = useResource<ConsolidationSources>(
    comparison
      ? workspace.companyPath(
          `consolidation/sources?comparison_id=${comparison.id}`,
        )
      : null,
  );
  const mappings = useResource<ResourceList<IntercompanyMapping>>(
    comparison
      ? workspace.companyPath(
          `consolidation/mappings?group_id=${comparison.group_id}`,
        )
      : null,
  );
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingValue, setMappingValue] = useState({
    left_company: "",
    right_company: "",
    left_party_id: "",
    right_party_id: "",
    ownership_100: false,
    ownership_note: "",
  });
  const [pairs, setPairs] = useState([emptyPair()]);
  const [draft, setDraft] = useState<ConsolidationDraft | null>(null);
  const approvalCommand = useCommand();
  const [approvalDraftId, setApprovalDraftId] = useState<string | null>(null);
  const approvalPreview = useResource<ConsolidationApprovalPreview>(
    approvalDraftId ? workspace.companyPath(`consolidation/drafts/${approvalDraftId}/approval-preview`) : null,
  );
  const [page, setPage] = useState(0);
  const latest = new Map<string, IntercompanyMapping>();
  for (const item of listItems(mappings.data)) {
    const key = `${item.left_company}:${item.right_company}`;
    if (!latest.has(key) || latest.get(key)!.version < item.version)
      latest.set(key, item);
  }
  const currentMappings = [...latest.values()];
  const companies = sources.data?.companies || [];
  const canManage = workspace.company?.role === "owner";
  const canDraft = workspace.canWrite && !!comparison && !!sources.data && !!mappings.data
    && !sources.loading && !mappings.loading && !sources.error && !mappings.error
    && sources.data.unavailable.length === 0;
  function selectComparison(value: ConsolidationComparison) {
    if (command.busy) return;
    setComparison(null);
    setDraft(null);
    setApprovalDraftId(null);
    void command.run<ConsolidationComparison>(
      workspace.companyPath(`company-groups/runs/${value.id}`),
      { method: "GET" },
      (result) => {
        setComparison(result);
        setPairs([emptyPair()]);
        setDraft(null);
        setPage(0);
      },
    );
  }
  function openMapping() {
    setMappingValue({
      left_company: companies[0]?.company_id || "",
      right_company: companies[1]?.company_id || "",
      left_party_id: "",
      right_party_id: "",
      ownership_100: false,
      ownership_note: "",
    });
    setMappingOpen(true);
    command.clearError();
  }
  function saveMapping() {
    if (!canManage || !comparison || !mappingValue.ownership_100) return;
    const previous = currentMappings.find(
      (item) =>
        item.left_company === mappingValue.left_company &&
        item.right_company === mappingValue.right_company,
    );
    void command.run(
      workspace.companyPath("consolidation/mappings"),
      {
        body: { group_id: comparison.group_id, ...mappingValue },
        version: previous?.version || 1,
      },
      () => {
        setMappingOpen(false);
        mappings.refresh();
      },
      "نگاشت و اظهار مالکیت ذخیره شد.",
    );
  }
  function saveDraft() {
    if (!canDraft || !comparison) return;
    void command.run<ConsolidationDraft>(
      workspace.companyPath("consolidation/drafts"),
      { body: { comparison_id: comparison.id, pairs } },
      (result) => {
        setDraft(result);
        setPage(0);
        drafts.refresh();
      },
      "پیش‌نویس حذف ذخیره شد.",
    );
  }
  function viewDraft(item: ConsolidationDraft) {
    if (command.busy || approvalCommand.busy) return;
    setDraft(null);
    setApprovalDraftId(null);
    void command.run<ConsolidationDraft>(
      workspace.companyPath(`consolidation/drafts/${item.id}`),
      { method: "GET" },
      (result) => {
        setDraft(result);
        setPage(0);
      },
    );
  }
  function openApproval() {
    if (!draft || !workspace.canApprove || !draft.can_approve || approvalCommand.busy) return;
    approvalCommand.clearError();
    setApprovalDraftId(draft.id);
  }
  function approve() {
    const checked = approvalPreview.data;
    if (!draft || !workspace.canApprove || !checked?.can_approve
      || approvalPreview.loading || approvalPreview.error
      || checked.draft_id !== draft.id || checked.expected_digest !== draft.digest) return;
    void approvalCommand.run<ConsolidationApproval>(
      workspace.companyPath(`consolidation/drafts/${checked.draft_id}/approvals`),
      { body: { expected_digest: checked.expected_digest, policy_version: checked.policy_version } },
      (approval) => {
        setApprovalDraftId(null);
        setDraft((current) => current?.id === checked.draft_id ? {
          ...current,
          approval_status: "approved_selected_eliminations",
          approvals: [...current.approvals.filter((item) => item.id !== approval.id), approval],
        } : current);
        drafts.refresh();
      },
      "تأیید همین نسخهٔ گزارش ثبت شد.",
    );
  }
  const labelCompany = (id: string) =>
    companies.find((item) => item.company_id === id)?.name || id;
  const pairViews = pairs.map((pair) => {
    const mapping = currentMappings.find((item) => item.id === pair.mapping_id);
    const options = (id?: string) =>
      sources.data?.rows
        .filter((row) => row.company_id === id)
        .map((row) => ({
          value: row.id,
          label: `${row.account} · ${row.party_id} · ${row.reference || "بدون مرجع"} · ${displayDate(row.date)} · بدهکار ${amount(row.debit)} / بستانکار ${amount(row.credit)}`,
        })) || [];
    return {
      ...pair,
      leftOptions: options(mapping?.left_company),
      rightOptions: options(mapping?.right_company),
    };
  });
  const maxPage = Math.max(
    0,
    Math.ceil((draft?.snapshot.pairs.length || 0) / 25) - 1,
  );
  return {
    workspace,
    command,
    history,
    drafts,
    comparison,
    sources,
    mappings,
    mappingOpen,
    mappingValue,
    companies,
    currentMappings,
    draft,
    approvalPreview,
    approvalCommand,
    approvalOpen: !!approvalDraftId,
    openApproval,
    approve,
    closeApproval: () => { if (!approvalCommand.busy) setApprovalDraftId(null); },
    canReviewApproval: !!draft && workspace.canApprove && draft.can_approve
      && !draft.approvals?.some((item) => item.actor_id === workspace.user?.id),
    approvalRows: (draft?.approvals || []).map((item) => ({
      ...item,
      timeLabel: new Intl.DateTimeFormat("fa-IR", {timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short"}).format(new Date(item.created_at)),
    })),
    page,
    pairs: pairViews,
    canManage,
    canDraft,
    mappingOptions: currentMappings.map((item) => ({
      value: item.id,
      label: `${labelCompany(item.left_company)} (${item.left_party_id}) / ${labelCompany(item.right_company)} (${item.right_party_id}) · نسخه ${item.version}`,
    })),
    companyOptions: companies.map((item) => ({
      value: item.company_id,
      label: item.name,
    })),
    selectComparison,
    openMapping,
    saveMapping,
    saveDraft,
    viewDraft,
    closeMapping: () => setMappingOpen(false),
    changeMapping: (patch: Partial<typeof mappingValue>) =>
      setMappingValue((previous) => ({ ...previous, ...patch })),
    changePair: (index: number, patch: Partial<(typeof pairs)[number]>) =>
      setPairs((previous) =>
        previous.map((pair, position) =>
          position === index
            ? {
                ...pair,
                ...patch,
                ...("mapping_id" in patch
                  ? { left_line_id: "", right_line_id: "" }
                  : {}),
              }
            : pair,
        ),
      ),
    addPair: () => setPairs((previous) => [...previous, emptyPair()]),
    removePair: (index: number) =>
      setPairs((previous) =>
        previous.filter((_, position) => position !== index),
      ),
    pairRows: draft?.snapshot.pairs.slice(page * 25, (page + 1) * 25) || [],
    pairTotal: draft?.snapshot.pairs.length || 0,
    previous: () => setPage((value) => Math.max(0, value - 1)),
    next: () => setPage((value) => Math.min(maxPage, value + 1)),
    exportHref: draft
      ? `/api/v1${workspace.companyPath(`consolidation/drafts/${draft.id}/export`)}`
      : "",
  };
}
