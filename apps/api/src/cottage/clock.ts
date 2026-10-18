/**
 * The cottage's clock. Tests move it to a chosen hour so quiet hours and budgets are decided
 * deterministically; alarms are scheduled as a delay from it, so they ring at the right moment
 * either way.
 */
export const cottageClock = { now: (): number => Date.now() };
