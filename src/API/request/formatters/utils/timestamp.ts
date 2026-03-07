export function padZeros(val: number | string, len: number = 2): string {
  let str = String(val);
  while (str.length < len) str = "0" + str;
  return str;
}

export function generateTimestampRelative(): string {
  const d = new Date();
  return d.getHours() + ":" + padZeros(d.getMinutes());
}

export function getCurrentTimestamp(): number {
  return Date.now();
}
