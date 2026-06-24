

import { UserData } from "../core/database/user-data";
import { ThreadData } from "../core/database/thread-data";
import type { UserInfo, ThreadInfo } from "./client";


export type DatabaseOrderDirection = "ASC" | "DESC" | "asc" | "desc";

export interface DatabaseOrderOption {
  column: string;
  direction?: DatabaseOrderDirection;
}

export interface DatabaseQueryOptions {
  limit?: number;
  offset?: number;
  order?: DatabaseOrderOption | DatabaseOrderOption[] | string | string[];
}

export interface UserDataModel {
  get: (userID: string | number) => Promise<UserData | null>;
  create: (userID: string | number, data: Partial<UserData>) => Promise<{ user: UserData; created: boolean }>;
  update: (userID: string | number, data: Partial<UserData>) => Promise<{ user: UserData; created: boolean }>;
  set: (userID: string | number, data: Partial<UserData>) => Promise<{ user: UserData; created: boolean }>;
  del: (userID: string | number) => Promise<number>;
  getAll: (keys?: string | string[] | null, options?: DatabaseQueryOptions) => Promise<UserData[]>;
  info: (userID: string | number) => Promise<UserInfo | null>;
  getBanned: () => Promise<UserData[]>;
  addBanned: (userID: string | number, reason: string) => Promise<{ user: UserData; created: boolean }>;
  removeBanned: (userID: string | number) => Promise<number>;
  getName: (userID: string | number) => Promise<string | null>;
  [key: string]: string | number | boolean | null | undefined | UserDataModel | Array<UserDataModel> | ((...args: unknown[]) => unknown);
}

export interface ThreadDataModel {
  get: (threadID: string | number) => Promise<ThreadData | null>;
  create: (threadID: string | number, data: Partial<ThreadData>) => Promise<{ thread: ThreadData; created: boolean }>;
  update: (threadID: string | number, data: Partial<ThreadData>) => Promise<{ thread: ThreadData; created: boolean }>;
  set: (threadID: string | number, data: Partial<ThreadData>) => Promise<{ thread: ThreadData; created: boolean }>;
  del: (threadID: string | number) => Promise<number>;
  getAll: (keys?: string | string[] | null, options?: DatabaseQueryOptions) => Promise<ThreadData[]>;
  info: (threadID: string | number) => Promise<ThreadInfo | null>;
  getBanned: () => Promise<ThreadData[]>;
  addBanned: (threadID: string | number, reason: string) => Promise<{ thread: ThreadData; created: boolean }>;
  removeBanned: (threadID: string | number) => Promise<number>;
  getName: (threadID: string | number) => Promise<string | null>;
  [key: string]: string | number | boolean | null | undefined | ThreadDataModel | Array<ThreadDataModel> | ((...args: unknown[]) => unknown);
}
