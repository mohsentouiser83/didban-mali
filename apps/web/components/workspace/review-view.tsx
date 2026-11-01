"use client";
import { ShieldCheckIcon as HeaderIcon } from "@phosphor-icons/react";
import { EvidenceList } from "./evidence-list";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCommand } from "@/hooks/use-command";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { listItems, type Finding, type ResourceList } from "@/lib/api";
import { ArrowUpLeftIcon, TextAaIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function ReviewView() {
  const workspace = useWorkspace();
  const resource = useResource<ResourceList<Finding>>(
    workspace.companyPath("findings"),
  );
  const command = useCommand();
  const [selected, setSelected] = useState<Finding | null>(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState("reviewed");
  if (!workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon} title="بررسی و شواهد" />
      <Panel title="موارد قابل رسیدگی">
        {resource.loading ? (
          <LoadingState />
        ) : resource.error ? (
          <ErrorState
            message={resource.error.message}
            onRetry={resource.refresh}
          />
        ) : listItems(resource.data).length ? (
          <div className="divide-y divide-border">
            {listItems(resource.data).map((finding) => (
              <div
                key={finding.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0"
              >
                <div>
                  <p className="font-medium">{finding.title}</p>
                  <StatusBadge status={finding.state} />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelected(finding);
                    setReason("");
                    command.clearError();
                  }}
                >
                  بررسی شواهد
                  <ArrowUpLeftIcon size={16} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="موردی برای بررسی نیست" />
        )}
      </Panel>
      <Drawer
        title={selected?.title || "بررسی شواهد"}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <div className="space-y-5">
            <EvidenceList evidence={selected.evidence} />
            {workspace.canWrite && selected.state === "open" && (
              <Form
                fieldErrors={command.error?.fields}
                onSubmit={(event) => {
                  event.preventDefault();
                  void command.run(
                    workspace.companyPath(`findings/${selected.id}/decisions`),
                    {
                      body: {
                        decision: state,
                        reason: reason.trim(),
                        expected_version: selected.version,
                      },
                      version: selected.version,
                    },
                    () => {
                      setSelected(null);
                      resource.refresh();
                    },
                    "نتیجه بررسی ثبت شد.",
                  );
                }}
              >
                <Field name="decision" id="finding-state" label="نتیجه بررسی">
                  <Select
                    id="finding-state"
                    value={state}
                    onValueChange={setState}
                    options={[
                      { value: "reviewed", label: "رسیدگی شد" },
                      { value: "dismissed", label: "نیاز به اقدام ندارد" },
                    ]}
                  />
                </Field>
                <Field id="finding-reason" label="دلیل" icon={TextAaIcon}>
                  <Textarea
                    id="finding-reason"
                    required
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
                <FormMessage error>{command.error?.message}</FormMessage>
                <Button type="submit" busy={command.busy}>
                  ثبت نتیجه
                </Button>
              </Form>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
