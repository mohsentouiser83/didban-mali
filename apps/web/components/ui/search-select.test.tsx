import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { SearchSelect } from "./search-select";
it("lets keyboard users choose a specific remote financial record", () => {
  const changed = vi.fn();
  render(
    <SearchSelect
      value=""
      onValueChange={changed}
      query=""
      onQueryChange={() => {}}
      options={[
        { value: "bank-1", label: "مرجع نخست" },
        { value: "bank-2", label: "مرجع دوم" },
      ]}
      searchLabel="جستجوی بانک"
    />,
  );
  fireEvent.click(screen.getByRole("combobox"));
  const search = screen.getByRole("searchbox", { name: "جستجوی بانک" });
  expect(search).toHaveFocus();
  fireEvent.keyDown(search, { key: "ArrowDown" });
  fireEvent.keyDown(search, { key: "Enter" });
  expect(changed).toHaveBeenCalledWith("bank-2", "مرجع دوم");
  expect(screen.getByRole("combobox")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
