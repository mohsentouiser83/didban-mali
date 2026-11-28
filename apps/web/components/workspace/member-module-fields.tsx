import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import {
  accessActions,
  visibleAccessModules,
  type AccessAction,
  type AccessModule,
  type ModuleAccess,
} from "@/lib/module-access";

const choices = [
  { value: "default", label: "طبق نقش" },
  { value: "allow", label: "مجاز" },
  { value: "deny", label: "غیرمجاز" },
];

export function MemberModuleFields({
  value,
  disabled,
  businessMode,
  onChange,
}: {
  value: ModuleAccess;
  disabled: boolean;
  businessMode?: "trading" | "service";
  onChange: (module: AccessModule, action: AccessAction, value: boolean | undefined) => void;
}) {
  const modules = visibleAccessModules({ business_mode: businessMode });
  const [module, setModule] = useState<AccessModule>("accounting");
  return (
    <fieldset className="space-y-3 border-t border-border pt-4">
      <legend className="sr-only">دسترسی ماژول‌ها</legend>
      <Field id="member-access-module" label="ماژول">
        <Select
          id="member-access-module"
          options={modules}
          value={module}
          onValueChange={(next) => setModule(next as AccessModule)}
          disabled={disabled}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {accessActions.map(({ value: action, label }) => {
          const override = value[module]?.[action];
          const id = `member-access-${action}`;
          return (
            <Field key={id} id={id} label={label}>
              <Select
                id={id}
                options={choices}
                value={override === undefined ? "default" : override ? "allow" : "deny"}
                onValueChange={(next) => onChange(module, action, next === "default" ? undefined : next === "allow")}
                disabled={disabled}
              />
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}
