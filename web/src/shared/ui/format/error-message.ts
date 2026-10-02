import { BffError } from "@/shared/http/bff-client";

export interface ErrorDescription {
  title: string;
  message: string;
}

/** Viewer-facing explanation of a failed BFF request. */
export function describeError(error: unknown): ErrorDescription {
  const code = error instanceof BffError ? error.code : "unknown";
  switch (code) {
    case "upstream_restricted":
      return {
        title: "Data source restricted",
        message:
          "Public OpenF1 blocks free access while any F1 session is live, and this session is not stored locally yet. It loads again once the live session ends.",
      };
    case "rate_limited":
      return { title: "Busy upstream", message: "The data source is rate limited. Retrying shortly." };
    case "network":
      return { title: "Connection problem", message: "Could not reach the server. Retrying automatically." };
    case "bad_request":
      return { title: "Invalid request", message: error instanceof Error ? error.message : "" };
    default:
      return { title: "Data unavailable", message: "The data source did not answer. Retrying automatically." };
  }
}
