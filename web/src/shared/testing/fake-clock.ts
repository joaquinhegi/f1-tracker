import type { Clock, Sleep } from "@/shared/time/clock";

/** Manually advanced clock; `sleep` advances it instantly. */
export class FakeClock {
  constructor(public nowMs: number) {}

  readonly clock: Clock = () => new Date(this.nowMs);

  readonly sleep: Sleep = async (ms) => {
    this.slept.push(ms);
    this.nowMs += ms;
  };

  readonly slept: number[] = [];

  advance(ms: number): void {
    this.nowMs += ms;
  }
}
