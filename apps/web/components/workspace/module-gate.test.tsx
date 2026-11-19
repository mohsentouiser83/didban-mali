import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ModuleGate } from "./module-gate";

afterEach(cleanup);

it("renders children directly without module restrictions so all customers have access to all features", () => {
  render(
    <ModuleGate>
      <p>full customer access to all features</p>
    </ModuleGate>,
  );
  expect(
    screen.getByText("full customer access to all features"),
  ).toBeInTheDocument();
});
