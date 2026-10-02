"use client";

import { usePathname, useRouter } from "next/navigation";
import type { WeekendOverviewDto } from "@/features/weekend/application/weekend-dto";
import { WeekendHeroContainer } from "@/features/weekend/ui/containers/WeekendHeroContainer";

/**
 * App-level glue: the selected session lives in the URL (`?session=<key>`),
 * so it is shareable and the server renders the map, grid and radio for it.
 */
export function WeekendSessionSwitcher({ overview, selectedSessionKey }: { overview: WeekendOverviewDto; selectedSessionKey: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <WeekendHeroContainer
      overview={overview}
      selectedSessionKey={selectedSessionKey}
      onSessionChange={(key) => router.push(`${pathname}?session=${key}`, { scroll: false })}
    />
  );
}
