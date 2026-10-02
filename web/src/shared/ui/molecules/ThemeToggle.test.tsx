import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("is a labelled radio group showing the current mode", () => {
    render(<ThemeToggle mode="system" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "Theme" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual(["system", "light", "dark"]);
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });

  it("picks a mode on click", async () => {
    const onChange = vi.fn();
    render(<ThemeToggle mode="system" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(onChange).toHaveBeenCalledWith("light");
  });

  it("is keyboard operable: Tab reaches the checked option, arrows move the choice", async () => {
    const onChange = vi.fn();
    render(<ThemeToggle mode="light" onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Light" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("dark");
  });
});
