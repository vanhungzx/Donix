export function getSequenceIdFromHtml(html: string | null | undefined): string | null {
  if (!html || typeof html !== "string") return null;

  function tryParsePayload(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch {
      // Ignore
    }

    try {
      const unescaped = JSON.parse('"' + String(raw).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
      try {
        return JSON.parse(unescaped);
      } catch {
        // Ignore
      }
    } catch {
      // Ignore
    }

    return null;
  }

  function decode(v: any): any {
    if (Array.isArray(v)) {
      if (v.length >= 2 && typeof v[0] === "number" && v[0] !== 5) {
        const code = v[0];
        if (code === 19) return String(v[1]);
        if (code === 9) return null;
        if (v.length === 2) return decode(v[1]);
        return v.slice(1).map(decode);
      }
      return v.map(decode);
    }
    if (v && typeof v === "object") {
      const out: any = {};
      for (const k of Object.keys(v)) out[k] = decode(v[k]);
      return out;
    }
    return v;
  }

  function collectOps(node: any, list: any[]): void {
    if (Array.isArray(node)) {
      if (node.length >= 2 && node[0] === 5 && typeof node[1] === "string") {
        list.push({ op: node[1], rawArgs: node.slice(2) });
      } else {
        for (const x of node) collectOps(x, list);
      }
    } else if (node && typeof node === "object") {
      for (const k of Object.keys(node)) collectOps(node[k], list);
    }
  }

  function walk(obj: any, pathArr: any[], hits: string[]): void {
    if (!obj) return;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) walk(obj[i], pathArr.concat(i), hits);
      return;
    }

    if (typeof obj === "object") {
      if (obj.lightspeed_web_request && obj.lightspeed_web_request.payload) {
        hits.push(String(obj.lightspeed_web_request.payload));
      }
      for (const k of Object.keys(obj)) walk(obj[k], pathArr.concat(k), hits);
    }
  }

  const hits: string[] = [];

  // Try to match lightspeed_web_request payload pattern
  const rePayload = /"lightspeed_web_request"\s*:\s*\{\s*"payload"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = rePayload.exec(html)) !== null) {
    hits.push(m[1]);
  }

  const reJsonBlocks = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let b;
  while ((b = reJsonBlocks.exec(html)) !== null) {
    const raw = b[1] || "";
    try {
      const obj = JSON.parse(raw);
      walk(obj, [], hits);
    } catch {
      // Ignore
    }
  }

  // Process all hits
  for (const raw of hits) {
    const parsed = tryParsePayload(raw);
    if (!parsed) continue;

    const ops: any[] = [];
    collectOps(parsed, ops);

    for (const o of ops) {
      const args = decode(o.rawArgs);
      if (o.op === "upsertSequenceId" || o.op === "upsertSequenceID") {
        const cand = args && args[0] != null ? String(args[0]) : "";
        if (cand) return cand;
      }
    }
  }

  return null;
}
