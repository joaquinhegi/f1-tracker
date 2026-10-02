/** JSON contract of GET /api/sessions/:sessionKey/team-radio. Client-safe. */
import type { RadioMessage } from "../domain/radio";

export interface RadioMessageDto {
  driverNumber: number;
  date: string;
  recordingUrl: string;
  lapNumber: number | null;
}

export interface TeamRadioDto {
  sessionKey: number;
  messages: RadioMessageDto[];
}

export function messagesFromDto(dto: TeamRadioDto): RadioMessage[] {
  return dto.messages.map((m) => ({ ...m, date: Date.parse(m.date) }));
}
