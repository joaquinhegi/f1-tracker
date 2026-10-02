import type { OpenF1Meeting, OpenF1Session } from "@/shared/f1-data/f1-data-provider";
import { parseUtcOffset, sessionKind, type Meeting, type WeekendSession } from "../domain/weekend";

export function meetingFromOpenF1(raw: OpenF1Meeting): Meeting {
  const start = new Date(raw.date_start);
  return {
    key: raw.meeting_key,
    name: raw.meeting_name,
    officialName: raw.meeting_official_name,
    countryName: raw.country_name,
    countryCode: raw.country_code,
    countryFlagUrl: raw.country_flag ?? null,
    location: raw.location,
    circuitKey: raw.circuit_key,
    circuitName: raw.circuit_short_name,
    utcOffsetMinutes: parseUtcOffset(raw.gmt_offset),
    start,
    end: raw.date_end ? new Date(raw.date_end) : start,
    isCancelled: raw.is_cancelled ?? false,
  };
}

export function sessionFromOpenF1(raw: OpenF1Session): WeekendSession {
  return {
    key: raw.session_key,
    meetingKey: raw.meeting_key,
    name: raw.session_name,
    type: raw.session_type,
    kind: sessionKind(raw.session_name),
    start: new Date(raw.date_start),
    end: new Date(raw.date_end),
    isCancelled: raw.is_cancelled ?? false,
  };
}
