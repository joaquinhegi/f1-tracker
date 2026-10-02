import { describe, expect, it } from "vitest";
import { loadSelection, saveSelection } from "./selection-store";

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

describe("selection store", () => {
  it("round-trips per session", () => {
    const storage = new MemoryStorage();
    saveSelection(11727, [1, 81], storage);
    expect(loadSelection(11727, storage)).toEqual([1, 81]);
    expect(loadSelection(11728, storage)).toBeNull();
  });

  it("survives corrupt values and throwing storage", () => {
    const storage = new MemoryStorage();
    storage.setItem("f1-tracker:checked-drivers:1", "{oops");
    expect(loadSelection(1, storage)).toBeNull();
    storage.setItem("f1-tracker:checked-drivers:1", JSON.stringify([4, "x", -1]));
    expect(loadSelection(1, storage)).toEqual([4]);
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadSelection(1, throwing)).toBeNull();
    expect(() => saveSelection(1, [1], throwing)).not.toThrow();
  });
});
