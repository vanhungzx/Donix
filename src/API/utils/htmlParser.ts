
export function getFrom(html: string, a: string, b: string): string | undefined {
  const i = html.indexOf(a);
  if (i < 0) return undefined;
  const start = i + a.length;
  const j = html.indexOf(b, start);
  return j < 0 ? undefined : html.slice(start, j);
}
