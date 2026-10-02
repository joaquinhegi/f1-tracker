import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Driver } from "@/features/drivers/domain/driver";
import { RadioChat, type ChatMessage, type RadioChatProps } from "./RadioChat";

const ham: Driver = { number: 44, acronym: "HAM", fullName: "Lewis HAMILTON", teamName: "Ferrari", teamColour: "#ED1131", headshotUrl: null };
const nor: Driver = { number: 1, acronym: "NOR", fullName: "Lando NORRIS", teamName: "McLaren", teamColour: "#F47600", headshotUrl: null };
const msg = (id: string, driver: Driver, lapNumber: number | null): ChatMessage => ({
  id, driver, recordingUrl: `https://livetiming.formula1.com/static/${id}.mp3`, timeLabel: "14:12:21", lapNumber,
});

const props = (overrides: Partial<RadioChatProps> = {}): RadioChatProps => ({
  filter: "all",
  options: [{ driver: nor, count: 0 }, { driver: ham, count: 2 }],
  totalCount: 2,
  messages: [],
  onFilterChange: () => {},
  empty: { title: "nothing" },
  ...overrides,
});

describe("RadioChat", () => {
  it("shows all drivers as a group chat, each bubble naming its driver", () => {
    render(<RadioChat {...props({ messages: [msg("a", ham, 3), msg("b", nor, null)] })} />);
    expect(screen.getByRole("log", { name: "Team radio of all drivers" })).toBeInTheDocument();
    expect(screen.getByText("All drivers")).toBeInTheDocument();
    expect(screen.getByText("2 messages in this session")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Play team radio of HAM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Play team radio of NOR/ })).toBeInTheDocument();
    expect(screen.getByText("Lewis HAMILTON")).toBeInTheDocument();
    expect(screen.getByText("Lap 3")).toBeInTheDocument();
    expect(screen.getByText(/audio only/i)).toBeInTheDocument();
  });

  it("filters to one driver from the picker, with counts and drivers without radio disabled", async () => {
    const onFilterChange = vi.fn();
    render(<RadioChat {...props({ onFilterChange })} />);
    const picker = screen.getByRole("combobox", { name: "Driver" });
    expect(screen.getByRole("option", { name: "All drivers (2)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "NOR · Lando NORRIS (0)" })).toBeDisabled();
    await userEvent.selectOptions(picker, "44");
    expect(onFilterChange).toHaveBeenCalledWith(44);
    await userEvent.selectOptions(picker, "all");
    expect(onFilterChange).toHaveBeenLastCalledWith("all");
  });

  it("shows one driver's header when filtered", () => {
    render(<RadioChat {...props({ filter: 44, messages: [msg("a", ham, 1)] })} />);
    expect(screen.getByRole("log", { name: "Team radio of Lewis HAMILTON" })).toBeInTheDocument();
    expect(screen.getByText("Ferrari · 2 messages")).toBeInTheDocument();
  });

  it("shows the empty state with its jump action", async () => {
    const onClick = vi.fn();
    render(
      <RadioChat
        {...props({ empty: { title: "7 messages in this session", message: "The first one is at 14:01.", action: { label: "Jump to the first message", onClick } } })}
      />,
    );
    expect(screen.getByText("7 messages in this session")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Jump to the first message" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("shows a 'new messages' pill when the viewer has scrolled up", () => {
    const { rerender } = render(<RadioChat {...props({ messages: [msg("a", ham, 1)] })} />);
    const log = screen.getByRole("log");
    // jsdom has no layout: fake being scrolled far from the bottom.
    Object.defineProperties(log, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 }, scrollTop: { value: 0, writable: true } });
    log.dispatchEvent(new Event("scroll"));
    rerender(<RadioChat {...props({ messages: [msg("a", ham, 1), msg("b", nor, 2)] })} />);
    expect(screen.getByRole("button", { name: /1 new message/ })).toBeInTheDocument();
  });
});
