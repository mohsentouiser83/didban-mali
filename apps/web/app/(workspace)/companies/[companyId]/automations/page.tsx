import { redirect } from "next/navigation";

export default async function LegacyPage({ params, searchParams }: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companyId } = await params;
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }

  redirect(`/companies/${companyId}/settings/financial-controls/automations${query.size ? `?${query}` : ""}`);
}
