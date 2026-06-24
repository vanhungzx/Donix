import fs, { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type DocumentBase = {
  _id: string;
  timestamp?: string;
  [key: string]: any;
};

class Collection<T extends DocumentBase = DocumentBase> {
  name: string;
  path: string;
  private _cache: T[] | null;
  private _cacheTime: number;
  private _cacheTTL: number;

  private _maxCacheSize: number; // Giới hạn số lượng items trong cache

  constructor(name: string) {
    this.name = name;
    this.path = path.join(__dirname, "data", `${name}.json`);
    this._cache = null;
    this._cacheTime = 0;
    this._cacheTTL = 1 * 60 * 1000; // Giảm từ 5 phút xuống 1 phút để realtime
    this._maxCacheSize = 1000; // Giới hạn 1000 items trong cache
    this._initFile();
  }

  private async _initFile(): Promise<void> {
    const dir = path.dirname(this.path);
    try {
      await fsPromises.access(dir);
    } catch {
      await fsPromises.mkdir(dir, { recursive: true });
    }
    try {
      await fsPromises.access(this.path);
    } catch {
      await fsPromises.writeFile(this.path, "[]", "utf-8");
    }
  }

  private async _read(): Promise<T[]> {
    const now = Date.now();
    if (this._cache !== null && now - this._cacheTime < this._cacheTTL) {
      // Giới hạn cache size - chỉ trả về phần cần thiết
      if (this._cache.length > this._maxCacheSize) {
        return this._cache.slice(-this._maxCacheSize);
      }
      return this._cache;
    }
    try {
      const content = await fsPromises.readFile(this.path, "utf-8");
      const data = JSON.parse(content) as unknown;
      const arr = Array.isArray(data) ? (data as T[]) : [];
      // Giới hạn cache size - chỉ cache phần cuối
      if (arr.length > this._maxCacheSize) {
        this._cache = arr.slice(-this._maxCacheSize);
      } else {
        this._cache = arr;
      }
      this._cacheTime = now;
      return this._cache;
    } catch {
      this._cache = [];
      this._cacheTime = now;
      return [];
    }
  }

  private _readSync(): T[] {
    try {
      const content = fs.readFileSync(this.path, "utf-8");
      const data = JSON.parse(content) as unknown;
      return Array.isArray(data) ? (data as T[]) : [];
    } catch {
      return [];
    }
  }

  private async _write(data: T[]): Promise<void> {
    try {
      await fsPromises.writeFile(this.path, JSON.stringify(data, null, 2), "utf-8");
      this._cache = data;
      this._cacheTime = Date.now();
    } catch (e) {
      console.error("Error writing to file", e);
    }
  }

  private _writeSync(data: T[]): void {
    try {
      fs.writeFileSync(this.path, JSON.stringify(data, null, 2), "utf-8");
      this._cache = data;
      this._cacheTime = Date.now();
    } catch (e) {
      console.error("Error writing to file", e);
    }
  }

  invalidateCache(): void {
    this._cache = null;
    this._cacheTime = 0;
  }

  async find(query: Partial<T> = {}): Promise<T[]> {
    const data = await this._read();
    const entries = Object.entries(query) as [keyof T, unknown][];
    return data.filter(doc =>
      entries.every(([key, value]) => JSON.stringify(doc[key]) === JSON.stringify(value))
    );
  }

  async findOne(query: Partial<T> = {}): Promise<T | null> {
    const results = await this.find(query);
    return results[0] || null;
  }

  async addOne(doc: T): Promise<T> {
    const data = await this._read();
    const existingIndex = data.findIndex(item => item._id === doc._id);
    if (existingIndex !== -1) {
      const updated: T = {
        ...(data[existingIndex] as T),
        ...(doc as T),
        timestamp: doc.timestamp || new Date().toISOString()
      };
      data[existingIndex] = updated;
    } else {
      const newDoc: T = {
        ...(doc as T),
        timestamp: doc.timestamp || new Date().toISOString()
      };
      data.push(newDoc);
    }
    await this._write(data);
    return data[existingIndex !== -1 ? existingIndex : data.length - 1];
  }

  async updateOneUsingId(id: string, update: Partial<T>): Promise<T | null> {
    const data = await this._read();
    const index = data.findIndex(doc => doc._id === id);
    if (index !== -1) {
      const updated: T = { ...(data[index] as T), ...(update as T) };
      data[index] = updated;
      await this._write(data);
      return updated;
    }
    return null;
  }

  async deleteOneUsingId(id: string): Promise<boolean> {
    const data = (await this._read()).filter(doc => doc._id !== id);
    await this._write(data);
    return true;
  }

  async deleteMany(query: Partial<T> = {}): Promise<boolean> {
    const entries = Object.entries(query) as [keyof T, unknown][];
    const data = (await this._read()).filter(
      doc => !entries.every(([key, value]) => doc[key] === value)
    );
    await this._write(data);
    return true;
  }

  findSync(query: Partial<T> = {}): T[] {
    const data = this._readSync();
    const entries = Object.entries(query) as [keyof T, unknown][];
    return data.filter(doc =>
      entries.every(([key, value]) => JSON.stringify(doc[key]) === JSON.stringify(value))
    );
  }

  findOneSync(query: Partial<T> = {}): T | null {
    const results = this.findSync(query);
    return results[0] || null;
  }

  addOneSync(doc: T): T {
    const data = this._readSync();
    const existingIndex = data.findIndex(item => item._id === doc._id);
    if (existingIndex !== -1) {
      const updated: T = {
        ...(data[existingIndex] as T),
        ...(doc as T),
        timestamp: doc.timestamp || new Date().toISOString()
      };
      data[existingIndex] = updated;
    } else {
      const newDoc: T = {
        ...(doc as T),
        timestamp: doc.timestamp || new Date().toISOString()
      };
      data.push(newDoc);
    }
    this._writeSync(data);
    return data[existingIndex !== -1 ? existingIndex : data.length - 1];
  }

  updateOneUsingIdSync(id: string, update: Partial<T>): T | null {
    const data = this._readSync();
    const index = data.findIndex(doc => doc._id === id);
    if (index !== -1) {
      const updated: T = { ...(data[index] as T), ...(update as T) };
      data[index] = updated;
      this._writeSync(data);
      return updated;
    }
    return null;
  }
}

class Database {
  createCollection<T extends DocumentBase = DocumentBase>(name: string): Collection<T> {
    return new Collection<T>(name);
  }
}

const database = new Database();

export { Collection, Database, database };
