"use strict";

interface NodeRequire {
  cache: Record<string, NodeModule>;
}

declare const require: NodeRequire;

export function cleanupRequireCache(): void {

  if (typeof require !== "undefined" && require.cache) {

    const cache = require.cache;
    const keys = Object.keys(cache);
    for (const key of keys) {

      if (!key.includes("node_modules") && !key.includes("core")) {
        delete cache[key];
      }
    }
  }
}

export function forceGC(): void {

  if (typeof global.gc === "function") {
    try {
      const rssMB = process.memoryUsage().rss / 1024 / 1024;

      if (rssMB > 500) {
        global.gc();
      }

    } catch (error) {

    }
  }
}
