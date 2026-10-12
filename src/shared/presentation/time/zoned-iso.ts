const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

/**
 * ISO-8601 local date-time with the zone's offset at that instant, e.g. `2030-01-15T08:00:00+07:00`
 * (A-7). Seconds precision. `timeZone` is an IANA name already validated by the domain.
 */
export function toZonedIso(instant: Date, timeZone: string): string {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  // `longOffset` gives "GMT+07:00", or plain "GMT" when the offset is zero.
  const offset = part('timeZoneName').replace('GMT', '') || '+00:00';
  return (
    `${part('year')}-${part('month')}-${part('day')}` +
    `T${part('hour')}:${part('minute')}:${part('second')}${offset}`
  );
}
