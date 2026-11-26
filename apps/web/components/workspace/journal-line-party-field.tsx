import { Field } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { useJournalPartyOptions } from "@/hooks/use-journal-party-options";

export function JournalLinePartyField({ id, value, editable, onChange }: {
  id: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  const options = useJournalPartyOptions(value, onChange, editable);

  return (
    <Field id={id} label="طرف‌حساب">
      <SearchSelect
        id={id}
        value={value}
        disabled={!editable}
        searchLabel="جست‌وجو در نام یا کد طرف‌حساب"
        placeholder="بدون طرف‌حساب"
        {...options}
      />
    </Field>
  );
}
