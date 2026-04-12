"use strict";

import type { MQTTContext } from "@types";
import { generateOfflineThreadingID, getType } from "../../request/formatters";

type Gender = "MALE" | "FEMALE" | "UNKNOWN";

interface ContactProfile {
  contactId: string;
  id: string;
  name: string;
  username: string;
  firstName: string;
  searchableName: string;
  vanity: string;
  thumbSrc: string | null;
  isMessengerUser: boolean;
  isVerified: boolean;
  isBlocked: boolean;
  canMessage: unknown;
  gender: Gender;
  genderCode: string;
  contactType: string;
  capabilities: string;
  lastActiveTime: string;
  updateSequence: string;
  privacyMode: string;
}

type OpNode = unknown;

type GetUserInfoCallback = (err: Error | null, profile?: ContactProfile) => void;

type ExtendedMQTTContext = MQTTContext & { req_ID?: number };

function parseGender(g: unknown): Gender {
  const s = g == null ? "" : String(g);
  if (s === "1") return "MALE";
  if (s === "2") return "FEMALE";
  return "UNKNOWN";
}

function unwrap<T>(v: T): unknown {
  if (Array.isArray(v)) {
    if (v.length === 2 && typeof v[0] === "number") return v[1];
    return v.map(unwrap);
  }
  return v;
}

function findOp(node: OpNode, name: string): unknown[] | null {
  if (!node) return null;

  if (Array.isArray(node)) {
    if (node.length > 1 && node[0] === 5 && node[1] === name) return node;
    for (const el of node) {
      const r = findOp(el, name);
      if (r) return r;
    }
  }
  return null;
}

function pickGenderCode(op: unknown[]): string {
  let gc: string | null = null;

  for (let i = 0; i < op.length - 1; i++) {
    const a = op[i];
    const b = op[i + 1];
    if (
      Array.isArray(a) &&
      a[0] === 19 &&
      typeof a[1] === "string" &&
      a[1].length >= 16 &&
      /^\d+$/.test(a[1])
    ) {
      if (
        Array.isArray(b) &&
        b[0] === 19 &&
        (b[1] === "1" || b[1] === "2")
      ) {
        gc = String(b[1]);
        break;
      }
    }
  }

  if (
    !gc &&
    Array.isArray(op[41]) &&
    op[41][0] === 19 &&
    (op[41][1] === "1" || op[41][1] === "2")
  ) {
    gc = String(op[41][1]);
  }

  return gc || "";
}

function buildProfileFromOp(op: unknown[], contactId?: string | number): ContactProfile {
  const u = (x: unknown) => unwrap(x);

  const id = String(u(op[2]));
  const contactType = String(u(op[3]));
  const thumbSmall = u(op[4]) as string | null | undefined;
  const thumbLarge = u(op[7]) as string | null | undefined;
  const name = String(u(op[11] ?? ""));
  const username = String(u(op[12] ?? ""));
  const isMessengerUser = Boolean(u(op[13]));
  const isVerified = Boolean(u(op[14]));
  const isBlocked = Boolean(u(op[15]));
  const lastActiveTime = String(u(op[16] ?? "0"));
  const privacyMode = String(u(op[17] ?? "0"));
  const firstName = String(u(op[20] ?? ""));
  const capabilities = String(u(op[23] ?? ""));
  const canMessage = op[25];
  const searchableName = String(u(op[35] ?? ""));
  const updateSequence = String(u(op[39] ?? "0"));
  const vanity = String(u(op[45] ?? ""));
  const genderCode = pickGenderCode(op);

  return {
    contactId: String(contactId ?? id),
    id,
    name,
    username,
    firstName,
    searchableName,
    vanity,
    thumbSrc: (thumbLarge || thumbSmall || null) as string | null,
    isMessengerUser,
    isVerified,
    isBlocked,
    canMessage,
    gender: parseGender(genderCode),
    genderCode,
    contactType,
    capabilities,
    lastActiveTime,
    updateSequence,
    privacyMode,
  };
}

function parseContactProfile(payload: unknown, contactId?: string | number): ContactProfile | null {
  const step = (payload as { step?: unknown })?.step;
  const op =
    findOp(step, "deleteThenInsertContact") ||
    findOp(step, "insertContact") ||
    findOp(step, "updateContact");
  if (!op) return null;
  return buildProfileFromOp(op, contactId);
}

export default function (
  _defaultFuncs: unknown,
  _api: unknown,
  rawCtx: MQTTContext
): (contactId: string, callback?: GetUserInfoCallback) => Promise<ContactProfile> {
  const ctx = rawCtx as ExtendedMQTTContext;

  return function getUserInfo(
    contactId: string,
    callback?: GetUserInfoCallback
  ): Promise<ContactProfile> {
    let resolveFunc: (value: ContactProfile) => void = () => {};
    let rejectFunc: (reason?: unknown) => void = () => {};

    const returnPromise = new Promise<ContactProfile>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    let cb: GetUserInfoCallback | undefined = callback;

    if (
      !cb &&
      (getType(contactId) === "AsyncFunction" ||
        getType(contactId) === "Function")
    ) {
      cb = contactId as unknown as GetUserInfoCallback;
      contactId = "" as string;
    }

    if (!cb) {
      cb = (err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      };
    }

    if (!contactId) {
      const error = new Error("Contact ID is required");
      cb(error);
      return returnPromise;
    }

    if (!ctx.mqttClient) {
      const error = new Error("MQTT client is not connected");
      cb(error);
      return returnPromise;
    }

    if (typeof ctx.req_ID !== "number") ctx.req_ID = 0;
    const reqID = ++ctx.req_ID;

    const form = JSON.stringify({
      app_id: "2220391788200892",
      payload: JSON.stringify({
        tasks: [
          {
            label: "207",
            payload: JSON.stringify({ contact_id: contactId }),
            queue_name: "cpq_v2",
            task_id: Math.floor(Math.random() * 1001),
            failure_count: null,
          },
        ],
        epoch_id: generateOfflineThreadingID(),
        version_id: "8965252033599983",
      }),
      request_id: reqID,
      type: 3,
    });

    const handleResponse = (topic: string, message: Buffer): void => {
      if (topic !== "/ls_resp") return;

      let json: { request_id?: number; payload?: string | unknown };

      try {
        json = JSON.parse(message.toString());
        json.payload = JSON.parse(json.payload as string);
      } catch {
        return;
      }

      if (json.request_id !== reqID) return;

      ctx.mqttClient?.removeListener("message", handleResponse);

      const profile = parseContactProfile(json.payload, contactId);
      if (!profile) {
        const err = new Error("Failed to parse contact profile");
        cb?.(err);
        return rejectFunc(err);
      }

      cb?.(null, profile);
      resolveFunc(profile);
    };

    ctx.mqttClient.on("message", handleResponse);

    ctx.mqttClient.publish(
      "/ls_req",
      form,
      { qos: 1, retain: false },
      (err?: Error | null) => {
        if (err) {
          ctx.mqttClient?.removeListener("message", handleResponse);
          cb?.(err);
          rejectFunc(err);
        }
      }
    );

    return returnPromise;
  };
}
