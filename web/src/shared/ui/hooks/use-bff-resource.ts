"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBff, retryDelayMs } from "@/shared/http/bff-client";
import { useOnline } from "./use-online";

export interface BffResource<T> {
  data: T | null;
  /** Last error; `data` keeps the last good value meanwhile (stale-while-error). */
  error: unknown;
  loading: boolean;
  /** Retry now (resets the backoff). */
  retry: () => void;
}

export interface BffResourceOptions {
  /** Poll every `pollMs` while mounted (live data). Omit to load once. */
  pollMs?: number;
  /** Keep showing the previous URL's data until the new one arrives (sliding windows). */
  keepPrevious?: boolean;
}

/**
 * Loads (and optionally polls) one BFF URL. Failures retry with exponential
 * backoff (or the server's Retry-After); nothing is requested while the
 * browser is offline, and a request starts again as soon as it reconnects.
 * `url === null` means "nothing to load".
 */
export function useBffResource<T>(url: string | null, { pollMs, keepPrevious = false }: BffResourceOptions = {}): BffResource<T> {
  const online = useOnline();
  const [state, setState] = useState<{ url: string | null; data: T | null; error: unknown; loading: boolean }>({
    url,
    data: null,
    error: null,
    loading: url !== null,
  });
  const [nonce, setNonce] = useState(0);
  const attempts = useRef(0);

  // A new URL starts from scratch (adjusting state during render, not in an effect).
  if (state.url !== url) setState({ url, data: keepPrevious ? state.data : null, error: null, loading: url !== null });

  useEffect(() => {
    if (url === null || !online) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const data = await fetchBff<T>(url, controller.signal);
        attempts.current = 0;
        setState({ url, data, error: null, loading: false });
        if (pollMs) timer = setTimeout(load, pollMs);
      } catch (error) {
        if (controller.signal.aborted) return;
        attempts.current += 1;
        setState((s) => (s.url === url ? { ...s, error, loading: false } : s));
        timer = setTimeout(load, Math.max(retryDelayMs(attempts.current, error), pollMs ?? 0));
      }
    };
    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, pollMs, online, nonce]);

  const retry = useCallback(() => {
    attempts.current = 0;
    setNonce((n) => n + 1);
  }, []);

  return { data: state.data, error: state.error, loading: state.loading, retry };
}
