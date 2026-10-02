"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useBffResource } from "@/shared/ui/hooks/use-bff-resource";
import type { SessionDriversDto } from "../../application/driver-dto";
import { parseSelection, readSelectionRaw, saveSelection, subscribeSelection } from "../../application/selection-store";
import { defaultSelection, toggleDriver, type Driver } from "../../domain/driver";

interface SessionDriversContextValue {
  sessionKey: number;
  drivers: Driver[];
  byNumber: Map<number, Driver>;
  loading: boolean;
  error: unknown;
  retry: () => void;
  /** Drivers drawn on the map. null until known (stored choice or default). */
  checked: number[] | null;
  toggle: (driverNumber: number) => void;
  setChecked: (driverNumbers: number[]) => void;
  /** First time the running order is known and nothing was chosen: check the top 3, focus the leader. */
  applyDefaults: (order: number[]) => void;
  /** Highlighted driver (map ring, grid row). The leader until the viewer picks one. */
  focused: number | null;
  /** The viewer picks a driver: highlights it and filters the team radio to it. */
  focus: (driverNumber: number) => void;
  /** Team radio feed: every driver (default) or one. */
  radioFilter: "all" | number;
  setRadioFilter: (filter: "all" | number) => void;
}

const SessionDriversContext = createContext<SessionDriversContextValue | null>(null);

export interface SessionDriversProviderProps {
  sessionKey: number;
  live: boolean;
  children: ReactNode;
}

/** Entry list of the selected session plus the viewer's driver choices. */
export function SessionDriversProvider({ sessionKey, live, children }: SessionDriversProviderProps) {
  const { data, loading, error, retry } = useBffResource<SessionDriversDto>(`/api/sessions/${sessionKey}/drivers`, {
    // The entry list can still change while a session is live (late driver changes).
    pollMs: live ? 60_000 : undefined,
  });
  // Precedence: what the viewer chose now > what they chose before (localStorage) > the default.
  const storedRaw = useSyncExternalStore(
    subscribeSelection,
    () => readSelectionRaw(sessionKey),
    () => null,
  );
  const stored = useMemo(() => parseSelection(storedRaw), [storedRaw]);
  const [choice, setChoice] = useState<number[] | null>(null);
  const [defaults, setDefaults] = useState<number[] | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [radioFilter, setRadioFilterState] = useState<"all" | number>("all");
  const checked = choice ?? stored ?? defaults;

  const setChecked = useCallback(
    (next: number[]) => {
      setChoice(next);
      saveSelection(sessionKey, next);
    },
    [sessionKey],
  );

  const toggle = useCallback(
    (driverNumber: number) => setChecked(toggleDriver(checked ?? [], driverNumber)),
    [checked, setChecked],
  );

  const applyDefaults = useCallback((order: number[]) => {
    if (order.length === 0) return;
    setDefaults((current) => current ?? defaultSelection(order));
    setFocused((current) => current ?? order[0]);
  }, []);

  const focus = useCallback((driverNumber: number) => {
    setFocused(driverNumber);
    setRadioFilterState(driverNumber);
  }, []);

  const setRadioFilter = useCallback((filter: "all" | number) => {
    setRadioFilterState(filter);
    if (filter !== "all") setFocused(filter);
  }, []);

  const drivers = useMemo(() => data?.drivers ?? [], [data]);
  const value = useMemo<SessionDriversContextValue>(
    () => ({
      sessionKey,
      drivers,
      byNumber: new Map(drivers.map((d) => [d.number, d])),
      loading,
      error,
      retry,
      checked,
      toggle,
      setChecked,
      applyDefaults,
      focused,
      focus,
      radioFilter,
      setRadioFilter,
    }),
    [sessionKey, drivers, loading, error, retry, checked, toggle, setChecked, applyDefaults, focused, focus, radioFilter, setRadioFilter],
  );

  return <SessionDriversContext.Provider value={value}>{children}</SessionDriversContext.Provider>;
}

export function useSessionDrivers(): SessionDriversContextValue {
  const value = useContext(SessionDriversContext);
  if (!value) throw new Error("useSessionDrivers must be used inside <SessionDriversProvider>");
  return value;
}
