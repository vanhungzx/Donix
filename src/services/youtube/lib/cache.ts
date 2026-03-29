import { setTimeout } from "timers";
import type { CacheEntry, MaybePromise } from "./types.js";

export default class Cache<K, V> {
  readonly timeout: number;
  private readonly store = new Map<K, CacheEntry<V>>();

  constructor(timeout = 1000) {
    this.timeout = timeout;
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  set(key: K, value: V): this {
    const existing = this.store.get(key);
    if (existing) {
      clearTimeout(existing.tid);
    }
    this.store.set(key, {
      tid: setTimeout(this.delete.bind(this, key), this.timeout).unref(),
      value,
    });
    return this;
  }

  get(key: K): V | null {
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  values(): IterableIterator<CacheEntry<V>> {
    return this.store.values();
  }

  getOrSet(key: K, fn: () => V): V {
    if (this.has(key)) {
      return this.get(key) as V;
    }
    const value = fn();
    this.set(key, value);
    void (async () => {
      try {
        await (value as MaybePromise<unknown>);
      } catch {
        this.delete(key);
      }
    })();
    return value;
  }

  delete(key: K): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    clearTimeout(entry.tid);
    return this.store.delete(key);
  }

  clear(): void {
    for (const entry of this.store.values()) {
      clearTimeout(entry.tid);
    }
    this.store.clear();
  }
}
