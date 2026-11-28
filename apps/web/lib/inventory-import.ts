import type { ParsedTableImport } from "@/components/ui/table";
import type { InventoryCatalogue, InventoryItemKind } from "@/lib/inventory";

type CatalogueInput = {
  name: string;
  item_kind?: InventoryItemKind;
  base_unit?: string;
};

export interface InventoryImportRow {
  row: number;
  name: string;
  body?: CatalogueInput;
  error?: string;
}

export function previewInventoryCatalogue(
  file: ParsedTableImport,
  entity: InventoryCatalogue,
  existing: { name: string }[],
): InventoryImportRow[] {
  const clean = (value: string) => value.trim().replaceAll("ي", "ی").replaceAll("ك", "ک");
  const headers = file.headers.map((value) => clean(value).toLowerCase());
  const find = (labels: string[]) => headers.findIndex((value) => labels.includes(value));
  const names = new Set(existing.map((row) => clean(row.name)));
  const nameIndex = find(["نام کالا", "نام انبار", "نام", "عنوان", "name"]);
  const kindIndex = find(["نوع", "نوع قلم", "item_kind"]);
  const unitIndex = find(["واحد", "واحد پایه", "base_unit"]);

  return file.rows.map((row, index) => {
    const read = (column: number) => column < 0 ? "" : clean(String(row[column] ?? ""));
    const name = read(nameIndex);
    const rawKind = read(kindIndex);
    const kind: InventoryItemKind | null = !rawKind || rawKind === "goods" || rawKind === "کالا" ? "goods"
      : rawKind === "service" || rawKind === "خدمت" ? "service" : null;
    const baseUnit = read(unitIndex) || "عدد";
    let error = "";
    if (!name || name.length > 150) error = "نام باید ۱ تا ۱۵۰ نویسه باشد.";
    else if (names.has(name)) error = "نام در فهرست فعلی یا فایل تکراری است.";
    else if (entity === "items" && !kind) error = "نوع قلم باید کالا یا خدمت باشد.";
    else if (entity === "items" && baseUnit.length > 40) error = "واحد پایه بیش از ۴۰ نویسه است.";
    if (error) return { row: index + 1, name, error };
    names.add(name);

    const body: CatalogueInput = entity === "items" && kind
      ? { name, item_kind: kind, base_unit: baseUnit }
      : { name };
    return { row: index + 1, name, body };
  });
}
