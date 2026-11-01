export const IST = "Asia/Kolkata";
export const istDateKey = (value: Date | string = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export function istDayBoundary(day: string, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new Error("Choose a valid calendar date.");
  const value = new Date(
    `${day}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`,
  );
  if (Number.isNaN(value.getTime()) || istDateKey(value) !== day)
    throw new Error("Choose a valid calendar date.");
  return value;
}
export const istDate = (value: Date | string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: IST,
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Not set";
export const istDateTime = (value: Date | string | null) =>
  value
    ? `${new Intl.DateTimeFormat("en-IN", {
        timeZone: IST,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(new Date(value))} IST`
    : "—";
