"use client";
import { useState, useRef, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { createBody, value, fileBody, download } from "./payroll-form-values";
import { useAccess as useCompanyAccess } from "@/features/companies/use-companies";
import { usePayrollList } from "./use-payroll-list";
import { api, message } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { notify } from "@/components/ui/sonner";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { PayrollTemplateView } from "./payroll-template-view";
import {
  workTemplate,
  downloadPayrollCsv,
  WORK_TEMPLATE_LIMIT,
} from "./payroll-template-values";
import { persianDigits } from "@/lib/dates";
import { sampleContractOptions } from "./payroll-import-values";
import { PayrollForm, RuleReviewForm } from "./payroll-forms";
import {
  PayrollView,
  RunDetails,
  ImportDetails,
  EmployeeDetails,
} from "./payroll-view";
import {
  PayrollFinancialForm,
  type FinancialOptions,
} from "./payroll-financial-form";
import type { EmployeeStats } from "./employee-details-view";
import type {
  Area,
  Employee,
  Contract,
  Work,
  Rule,
  Run,
  Access,
  Summary,
  ImportPreview,
} from "./types";

type MutationInput = {
  path: string;
  body: unknown;
  method?: "POST" | "PATCH";
  version?: number;
};
export function PayrollController({ area }: { area: Area }) {
  const { companyId } = useParams<{ companyId: string }>(),
    base = `/api/v1/companies/${companyId}/payroll`,
    cache = useQueryClient();
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateSelection, setTemplateSelection] = useState<string[]>([]);
  const [form, setForm] = useState(false),
    [person, setPerson] = useState<Employee>(),
    [detailEmployee, setDetailEmployee] = useState<Employee>(),
    [financialForm, setFinancialForm] = useState(false),
    [selected, setSelected] = useState<Run>(),
    [review, setReview] = useState<Rule>(),
    [preview, setPreview] = useState<ImportPreview>(),
    [fileError, setFileError] = useState<string>();
  const access = useQuery({
    queryKey: ["payroll-access", companyId],
    queryFn: ({ signal }) =>
      api.get<Access>(`/api/v1/companies/${companyId}/payroll-access`, signal),
  });
  const companyAccess = useCompanyAccess(companyId);
  const enabled = access.data?.view === true;
  const employees = usePayrollList<Employee>(
    companyId,
    base,
    "employees",
    enabled,
  );
  const contracts = usePayrollList<Contract>(
    companyId,
    base,
    "contracts",
    enabled,
  );
  const work = usePayrollList<Work>(companyId, base, "work", enabled);
  const rules = usePayrollList<Rule>(companyId, base, "rules", enabled);
  const runs = usePayrollList<Run>(companyId, base, "runs", enabled);
  const summary = useQuery({
    queryKey: ["payroll", companyId, "summary"],
    queryFn: ({ signal }) => api.get<Summary>(base + "/summary", signal),
    enabled,
  });
  const employeeStats = useInfiniteQuery({
    queryKey: ["payroll", companyId, "employee-details", detailEmployee?.id],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<EmployeeStats>(
        base +
          "/employees/" +
          detailEmployee?.id +
          "/details?limit=100" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        signal,
      ),
    getNextPageParam: (page) => page.content.payment_next_cursor ?? undefined,
    enabled: enabled && !!detailEmployee,
  });
  const personalContracts = usePayrollList<Contract>(
    companyId,
    base,
    "employees/" + detailEmployee?.id + "/contracts",
    enabled && !!detailEmployee,
  );
  const personalWork = usePayrollList<Work>(
    companyId,
    base,
    "employees/" + detailEmployee?.id + "/work",
    enabled && !!detailEmployee,
  );
  const personalRuns = usePayrollList<Run>(
    companyId,
    base,
    "employees/" + detailEmployee?.id + "/runs",
    enabled && !!detailEmployee,
  );
  const financialOptions = useQuery({
    queryKey: ["payroll", companyId, "financial-options", selected?.id],
    queryFn: ({ signal }) =>
      api.get<FinancialOptions>(
        base + "/runs/" + selected?.id + "/financial-options",
        signal,
      ),
    enabled: enabled && financialForm && !!selected,
  });
  const action = useCommand<MutationInput, unknown>(
    (input, key) =>
      api.mutate(
        input.path,
        input.method ?? "POST",
        input.body,
        key,
        input.version,
      ),
    async (output) => {
      await cache.invalidateQueries({ queryKey: ["payroll", companyId] });
      setForm(false);
      setPerson(undefined);
      setReview(undefined);
      setPreview(undefined);
      setFinancialForm(false);
      if (
        output &&
        typeof output === "object" &&
        "content" in output &&
        "approved" in output
      )
        setSelected(output as Run);
      notify.success("ثبت شد.");
    },
  );
  const importing = useCommand<unknown, ImportPreview>(
    (body, key) => api.mutate(base + "/imports", "POST", body, key),
    (output) => setPreview(output),
  );
  const exporting = useCommand<
    { format: string },
    { filename: string; media_type: string; data_base64: string }
  >(
    (body, key) =>
      api.mutate(
        base + "/runs/" + selected?.id + "/exports",
        "POST",
        body,
        key,
      ),
    download,
  );
  const retry = () => {
    void access.refetch();
    for (const q of [employees, contracts, work, rules, runs, summary])
      void q.refetch();
  };
  if (access.isPending) return <LoadingState layout="table" />;
  if (access.error)
    return (
      <ErrorState
        message={message(access.error)}
        onRetry={() => void access.refetch()}
      />
    );
  if (!access.data.view)
    return <ErrorState message="دسترسی مشاهده اطلاعات حقوق ندارید." />;
  if (
    [employees, contracts, work, rules, runs, summary].some((q) => q.isPending)
  )
    return <LoadingState layout="table" />;
  const failed = [employees, contracts, work, rules, runs, summary].find(
    (q) => q.error,
  );
  if (
    failed ||
    !employees.data ||
    !contracts.data ||
    !work.data ||
    !rules.data ||
    !runs.data ||
    !summary.data
  )
    return <ErrorState message={message(failed?.error)} onRetry={retry} />;
  const employeeRows = employees.data.items,
    contractRows = contracts.data.items,
    workRows = work.data.items,
    ruleRows = rules.data.items,
    runRows = runs.data.items;
  const error = action.error || importing.error || exporting.error;
  const busy = action.isPending || importing.isPending || exporting.isPending;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    action.mutate({
      path:
        base +
        "/" +
        (area === "employees" && person ? "employees/" + person.id : area),
      body: createBody(area, data),
      method: area === "employees" && person ? "PATCH" : "POST",
      version: person?.version,
    });
  };
  return (
    <>
      <PayrollView
        importButtonRef={importButtonRef}
        area={area}
        employeeNames={Object.fromEntries(
          employeeRows.map((e) => [e.id, e.profile.name]),
        )}
        employees={employeeRows}
        contracts={contractRows}
        work={workRows}
        rules={ruleRows}
        runs={runRows}
        summary={summary.data}
        access={access.data}
        canReviewRules={companyAccess.data?.role === "finance_manager"}
        busy={busy}
        more={Boolean(
          { employees, contracts, work, rules, runs }[area].hasNextPage,
        )}
        loadingMore={
          { employees, contracts, work, rules, runs }[area].isFetchingNextPage
        }
        onMore={() => {
          void { employees, contracts, work, rules, runs }[
            area
          ].fetchNextPage();
        }}
        onCreate={() => {
          action.reset();
          setPerson(undefined);
          setForm(true);
        }}
        onEdit={(p) => {
          action.reset();
          setPerson(p);
          setForm(true);
        }}
        onReview={(r) => {
          action.reset();
          setReview(r);
        }}
        onOpen={(r) => {
          action.reset();
          exporting.reset();
          setSelected(r);
        }}
        onEmployee={setDetailEmployee}
        onTemplate={() => {
          if (area === "work") {
            setTemplateSelection([]);
            setTemplateOpen(true);
          } else {
            downloadPayrollCsv(
              "\uFEFFpersonnel_code,name,national_id,insurance_number,hired_on,unit",
              "employees-template.csv",
            );
          }
        }}
        onImport={(file) => {
          setFileError(undefined);
          void fileBody(file, area === "employees" ? "employees" : "work")
            .then((body) => importing.mutate(body))
            .catch((e) => setFileError(message(e)));
        }}
      />
      {templateOpen ? (
        <PayrollTemplateView
          employees={employeeRows.map((e) => ({
            id: e.id,
            label: e.profile.name + " · " + e.personnel_code,
            selected: templateSelection.includes(e.id),
          }))}
          selectionLabel={`${persianDigits(String(templateSelection.length))} انتخاب از ${persianDigits(String(employeeRows.length))} کارمند بارگذاری‌شده`}
          more={Boolean(employees.hasNextPage)}
          loading={employees.isFetchingNextPage}
          canAdd={templateSelection.length < WORK_TEMPLATE_LIMIT}
          canDownload={templateSelection.length > 0}
          canSelectLoaded={
            employeeRows.filter((e) => !templateSelection.includes(e.id))
              .length +
              templateSelection.length <=
            WORK_TEMPLATE_LIMIT
          }
          error={employees.error ? message(employees.error) : undefined}
          onClose={() => setTemplateOpen(false)}
          onMore={() => void employees.fetchNextPage()}
          onToggle={(id, checked) =>
            setTemplateSelection((current) =>
              checked
                ? current.length < WORK_TEMPLATE_LIMIT && !current.includes(id)
                  ? [...current, id]
                  : current
                : current.filter((v) => v !== id),
            )
          }
          onSelectLoaded={() =>
            setTemplateSelection((current) =>
              [
                ...new Set([...current, ...employeeRows.map((e) => e.id)]),
              ].slice(0, WORK_TEMPLATE_LIMIT),
            )
          }
          onDownload={() => {
            downloadPayrollCsv(
              workTemplate(
                employeeRows.filter((e) => templateSelection.includes(e.id)),
              ),
              "work-selected-template.csv",
            );
            setTemplateOpen(false);
          }}
        />
      ) : null}
      {fileError ? (
        <ErrorState
          message={fileError}
          onRetry={() => setFileError(undefined)}
        />
      ) : null}
      {error && !form && !selected && !review && !preview ? (
        <ErrorState
          message={message(error)}
          onRetry={() => {
            action.reset();
            importing.reset();
            exporting.reset();
          }}
        />
      ) : null}
      {detailEmployee ? (
        <EmployeeDetails
          employee={detailEmployee}
          stats={
            employeeStats.data
              ? {
                  content: {
                    ...employeeStats.data.pages[0].content,
                    payments: employeeStats.data.pages.flatMap(
                      (p) => p.content.payments,
                    ),
                  },
                }
              : undefined
          }
          morePayments={Boolean(employeeStats.hasNextPage)}
          loadingPayments={employeeStats.isFetchingNextPage}
          onMorePayments={() => void employeeStats.fetchNextPage()}
          loading={[
            employeeStats,
            personalContracts,
            personalWork,
            personalRuns,
          ].some((q) => q.isPending)}
          error={
            [employeeStats, personalContracts, personalWork, personalRuns].some(
              (q) => q.error,
            )
              ? message(
                  [
                    employeeStats,
                    personalContracts,
                    personalWork,
                    personalRuns,
                  ].find((q) => q.error)?.error,
                )
              : undefined
          }
          onRetry={() => {
            void employeeStats.refetch();
            void personalContracts.refetch();
            void personalWork.refetch();
            void personalRuns.refetch();
          }}
          moreHistory={{
            contracts: Boolean(personalContracts.hasNextPage),
            work: Boolean(personalWork.hasNextPage),
            runs: Boolean(personalRuns.hasNextPage),
          }}
          loadingHistory={{
            contracts: personalContracts.isFetchingNextPage,
            work: personalWork.isFetchingNextPage,
            runs: personalRuns.isFetchingNextPage,
          }}
          onMoreHistory={(kind) => {
            void {
              contracts: personalContracts,
              work: personalWork,
              runs: personalRuns,
            }[kind].fetchNextPage();
          }}
          contracts={personalContracts.data?.items ?? []}
          work={personalWork.data?.items ?? []}
          runs={(personalRuns.data?.items ?? []).map((r) => ({
            ...r,
            content: {
              ...r.content,
              items: r.content.items.filter(
                (i) => i.employee_id === detailEmployee.id,
              ),
            },
          }))}
          onClose={() => setDetailEmployee(undefined)}
        />
      ) : null}
      {form ? (
        <PayrollForm
          area={area}
          employees={employeeRows}
          rules={ruleRows.filter((r) => r.reviewed)}
          person={person}
          moreEmployees={Boolean(employees.hasNextPage)}
          onMoreEmployees={() => void employees.fetchNextPage()}
          moreRules={Boolean(rules.hasNextPage)}
          onMoreRules={() => void rules.fetchNextPage()}
          busy={busy}
          error={error ? message(error) : undefined}
          onClose={() => setForm(false)}
          onSubmit={submit}
        />
      ) : null}
      {review ? (
        <RuleReviewForm
          rule={review}
          employeeNames={Object.fromEntries(
            employeeRows.map((e) => [e.id, e.profile.name]),
          )}
          moreSamples={Boolean(
            contracts.hasNextPage || work.hasNextPage || employees.hasNextPage,
          )}
          onMoreSamples={() => {
            if (contracts.hasNextPage) void contracts.fetchNextPage();
            if (work.hasNextPage) void work.fetchNextPage();
            if (employees.hasNextPage) void employees.fetchNextPage();
          }}
          contractOptions={sampleContractOptions(
            contractRows,
            Object.fromEntries(employeeRows.map((e) => [e.id, e.profile.name])),
          )}
          work={workRows}
          busy={busy}
          error={error ? message(error) : undefined}
          onClose={() => setReview(undefined)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              c = contractRows.find((c) => c.id === value(f, "contract_id")),
              w = workRows.find((w) => w.id === value(f, "work_id"));
            if (!c || !w) return;
            action.mutate({
              path: base + "/rules/" + review.id + "/reviews",
              body: {
                reference: value(f, "reference"),
                fixtures: [
                  {
                    contract: c.content,
                    work: w.content,
                    expected: {
                      gross: value(f, "expected_gross"),
                      net: value(f, "expected_net"),
                    },
                  },
                ],
              },
            });
          }}
        />
      ) : null}
      {selected && financialForm ? (
        <PayrollFinancialForm
          options={financialOptions.data}
          loading={financialOptions.isPending}
          busy={busy}
          error={
            error
              ? message(error)
              : financialOptions.error
                ? message(financialOptions.error)
                : undefined
          }
          onClose={() => setFinancialForm(false)}
          onRetry={() => void financialOptions.refetch()}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              plan = financialOptions.data?.content.plans.find(
                (p) => p.id === value(f, "existing_plan_id"),
              );
            action.mutate({
              path: base + "/runs/" + selected.id + "/financial-link",
              body: {
                scheduled_on: value(f, "scheduled_on"),
                existing_plan_id: plan?.id ?? null,
                existing_plan_version: plan?.version ?? null,
                source_manifest_id: f.getAll("ledger_line_ids").length
                  ? (financialOptions.data?.content.source_manifest_id ?? null)
                  : null,
                ledger_line_ids: f.getAll("ledger_line_ids").map(String),
                reason: value(f, "reason"),
              },
            });
          }}
        />
      ) : null}
      {selected && !financialForm ? (
        <RunDetails
          run={selected}
          access={access.data}
          busy={busy}
          error={error ? message(error) : undefined}
          onClose={() => setSelected(undefined)}
          onFinancial={() => {
            action.reset();
            setFinancialForm(true);
          }}
          onApprove={() =>
            action.mutate({
              path: base + "/runs/" + selected.id + "/approvals",
              body: {},
            })
          }
          onExport={(format) => exporting.mutate({ format })}
          onPayment={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            action.mutate({
              path: base + "/runs/" + selected.id + "/payments",
              body: {
                employee_id: value(f, "employee_id"),
                amount: value(f, "amount"),
                paid_on: value(f, "paid_on"),
                reference: value(f, "reference"),
                bank_movement_id: value(f, "bank_movement_id") || null,
              },
            });
          }}
        />
      ) : null}
      {preview ? (
        <ImportDetails
          returnFocusRef={importButtonRef}
          preview={preview}
          busy={busy}
          error={error ? message(error) : undefined}
          onClose={() => setPreview(undefined)}
          onCommit={() =>
            action.mutate({
              path: base + "/imports/" + preview.id + "/commit",
              body: {},
            })
          }
        />
      ) : null}
    </>
  );
}
