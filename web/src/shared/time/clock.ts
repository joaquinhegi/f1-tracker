/** Source of "now". Injected everywhere time matters so logic stays testable. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
