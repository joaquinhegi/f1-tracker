import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";

const items = [
  { id: "a", label: "FP1" },
  { id: "b", label: "FP2", disabled: true },
  { id: "c", label: "Race" },
];

describe("Tabs", () => {
  it("marks the selected tab and selects on click", async () => {
    const onSelect = vi.fn();
    render(<Tabs items={items} selectedId="a" onSelect={onSelect} ariaLabel="Sessions" panelId="p" />);
    expect(screen.getByRole("tab", { name: "FP1" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Race" }));
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("moves with arrow keys, skipping disabled tabs", async () => {
    const onSelect = vi.fn();
    render(<Tabs items={items} selectedId="a" onSelect={onSelect} ariaLabel="Sessions" panelId="p" />);
    screen.getByRole("tab", { name: "FP1" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onSelect).toHaveBeenLastCalledWith("c");
    expect(screen.getByRole("tab", { name: "Race" })).toHaveFocus();
  });
});
