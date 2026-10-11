/** Source of "now". Domain and application code never call `new Date()` directly. Also the DI token. */
export abstract class Clock {
  abstract now(): Date;
}
