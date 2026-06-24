"use strict";

import axios from "axios";
import { randomUUID } from "node:crypto";
import { getConfig } from "../../../core/configManager";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";

export interface MessageRequestThreadKey {
  thread_fbid?: string | null;
  other_user_id?: string | null;
}

export interface MessageRequestNode {
  id?: string | null;
  thread_key?: MessageRequestThreadKey | null;
}

export interface MessageRequestsResult {
  count: number;
  unread_count: number;
  unseen_count: number;
  banner_snippet: string | null;
  threads: Array<{
    id: string;
    thread_fbid: string | null;
    other_user_id: string | null;
    raw: MessageRequestNode;
  }>;
  other_threads_count: number;
  raw: unknown;
}

type GetMessageRequestsCallback = (err: Error | null, data?: MessageRequestsResult) => void;

const FRIENDLY_NAME = "MessageRequestsSnippet";
const CLIENT_DOC_ID = "3489149527261270978646937940";

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  _ctx: Context
): (callback?: GetMessageRequestsCallback) => Promise<MessageRequestsResult> {
  async function exec(cb: GetMessageRequestsCallback): Promise<void> {
    const token = getConfig().token?.EAAD;

    if (!token) {
      cb(new Error("Missing EAAD token in config to call graph.facebook.com"));
      return;
    }

    const deviceId = randomUUID();
    const appScopeId = randomUUID();
    const connUuid = randomUUID();

    const form = new URLSearchParams({
      method: "post",
      pretty: "false",
      format: "json",
      server_timestamps: "true",
      locale: "vi_VN",
      fb_api_req_friendly_name: FRIENDLY_NAME,
      fb_api_caller_class: "graphservice",
      client_doc_id: CLIENT_DOC_ID,
      fb_api_client_context: JSON.stringify({ is_background: false }),
      variables: JSON.stringify({
        max_names_count: 3,
      }),
      fb_api_analytics_tags: JSON.stringify(["GraphServices"]),
      client_trace_id: randomUUID(),
    });

    const headers: Record<string, string> = {
      "User-Agent":
        "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/536.0.0.46.216;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/840054738;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-tigon-is-retry": "False",
      "x-fb-network-properties": "Wifi;Validated;",
      priority: "u=3, i",
      "x-fb-friendly-name": FRIENDLY_NAME,
      "x-zero-f-device-id": deviceId,
      authorization: `OAuth ${token}`,
      "x-fb-connection-type": "WIFI",
      "app-scope-id-header": appScopeId,
      "x-fb-sim-hni": "45201",
      "x-fb-net-hni": "45201",
      "x-zero-eh": "2,,",
      "x-graphql-client-library": "graphservice",
      "x-fb-rmd": "state=URL_ELIGIBLE",
      "x-fb-request-analytics-tags":
        '{"network_tags":{"product":"256002347743983","request_category":"graphql","purpose":"none","retry_attempt":"0"},"application_tags":"graphservice"}',
      "x-fb-http-engine": "Tigon/Liger",
      "x-fb-client-ip": "True",
      "x-fb-server-cluster": "True",
      "x-fb-conn-uuid-client": connUuid,
    };

    try {
      const response = await axios.post("https://graph.facebook.com/graphql", form.toString(), {
        headers,
        maxRedirects: 0,
        validateStatus: () => true,
        responseType: "json",
        timeout: 60000,
      });

      if (response.status !== 200) {
        throw new Error(
          `GraphQL request failed with status ${response.status}: ${JSON.stringify(
            response.data
          )}`
        );
      }

      const out = response.data as any;
      if (out?.errors) {
        throw new Error(JSON.stringify(out.errors));
      }

      const root = out?.data?.viewer?.message_threads;
      const otherThreadsCount = out?.data?.viewer?.other_threads_count?.count ?? 0;

      if (!root) {
        throw new Error("No message_threads data in response");
      }

      const nodes: MessageRequestNode[] = root.nodes || [];

      const threads = nodes
        .map((n) => {
          const id = n?.id;
          if (!id) return null;
          const tk = n.thread_key || {};
          return {
            id: String(id),
            thread_fbid: tk.thread_fbid ?? null,
            other_user_id: tk.other_user_id ?? null,
            raw: n,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const result: MessageRequestsResult = {
        count: root.count ?? threads.length,
        unread_count: root.unread_count ?? 0,
        unseen_count: root.unseen_count ?? 0,
        banner_snippet: root.mailbox_banner_snippet ?? null,
        threads,
        other_threads_count: otherThreadsCount,
        raw: out,
      };

      cb(null, result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      cb(error);
    }
  }

  return function getMessageRequests(
    callback?: GetMessageRequestsCallback
  ): Promise<MessageRequestsResult> {
    if (typeof callback === "function") {
      exec(callback);
      // For callback usage we don't care about the promise value
      return Promise.resolve({
        count: 0,
        unread_count: 0,
        unseen_count: 0,
        banner_snippet: null,
        threads: [],
        other_threads_count: 0,
        raw: null,
      });
    }

    return new Promise<MessageRequestsResult>((resolve, reject) =>
      exec((e, d) => (e || !d ? reject(e || new Error("No data")) : resolve(d)))
    );
  };
}
