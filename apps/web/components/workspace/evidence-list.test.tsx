import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EvidenceList } from "./evidence-list";
const { resource } = vi.hoisted(() => ({ resource: vi.fn() }));
vi.mock("@/hooks/workspace", () => ({ useWorkspace: () => ({
  company: { id: "company-a" },
  companyPath: (path: string) => `/companies/company-a/${path}`,
}) }));
vi.mock("@/hooks/use-resource", () => ({ useResource: resource }));
it("links native evidence to the fixed company-authorized report without treating it as a source file", () => {
  const id = "74121290-0395-4829-af3b-4b65de4efaf7";
  render(<EvidenceList evidence={[`native-statement:${id}`]} />);
  expect(screen.getByRole("link", { name: "دریافت گزارش مالی" })).toHaveAttribute("href", `/api/v1/companies/company-a/accounting/statements/${id}/export?format=pdf`);
  expect(resource).not.toHaveBeenCalled();
});
it("never builds a download URL from an arbitrary native reference", () => {
  render(<EvidenceList evidence={["native-statement:../../other-company"]} />);
  expect(screen.queryByRole("link")).toBeNull();
});
