// The search compares ages and CV dates with today. A function, not a constant,
// so a long-running process never works from the day it started.
export const now = (): Date => new Date();
