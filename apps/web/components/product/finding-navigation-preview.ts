// A single short-lived title bridges navigation while case evidence loads.
let preview: {
  companyId: string;
  findingId: string;
  title: string;
  expiresAt: number;
} | null = null;
export function rememberFindingTitle(
  companyId: string,
  findingId: string,
  title: string,
) {
  preview = { companyId, findingId, title, expiresAt: Date.now() + 30_000 };
}
export function getFindingTitle(companyId: string, findingId: string) {
  return preview &&
    preview.companyId === companyId &&
    preview.findingId === findingId &&
    preview.expiresAt > Date.now()
    ? preview.title
    : undefined;
}
