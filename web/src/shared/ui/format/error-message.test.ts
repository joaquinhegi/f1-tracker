import { describe, expect, it } from "vitest";
import { BffError } from "@/shared/http/bff-client";
import { describeError } from "./error-message";

describe("describeError", () => {
  it("explains the live-session restriction", () => {
    expect(describeError(new BffError("upstream_restricted", "x", 503, 300_000)).title).toBe("Data source restricted");
  });

  it("falls back for unknown errors", () => {
    expect(describeError(new Error("boom")).title).toBe("Data unavailable");
    expect(describeError(new BffError("network", "x", 0, null)).title).toBe("Connection problem");
  });
});
