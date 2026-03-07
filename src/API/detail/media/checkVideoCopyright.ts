"use strict";

import type { Context } from "../../request/formatters/helpers";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

interface CheckVideoCopyrightOptions {
  videoId: string;
  actorId?: string;
  fromMbs?: boolean;
  maxWaitTime?: number; // milliseconds, default 60000 (1 minute)
  pollInterval?: number; // milliseconds, default 1000 (1 second)
}

interface CopyrightCheckResult {
  video_id: string;
  percentage: number;
  found_early_violation: boolean;
  early_violation_result: unknown;
  copyright_match_details: unknown[];
  is_finished: boolean;
}

type CheckVideoCopyrightCallback = (err: Error | null, data?: CopyrightCheckResult) => void;

const DEFAULT_MAX_WAIT_TIME = 60000; // 1 minute
const DEFAULT_POLL_INTERVAL = 1000; // 1 second

function cleanJSON(x: unknown): unknown {
  if (typeof x !== "string") return x;
  const s = x.replace(/^for\s*\(;;\);\s*/i, "");
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

async function startCopyrightCheck(
  defaultFuncs: DefaultFuncs,
  ctx: Context,
  videoId: string,
  actorId: string,
  fromMbs: boolean
): Promise<string> {
  const clientMutationId = Math.round(Math.random() * 100).toString();

  const variables = {
    input: {
      client_mutation_id: clientMutationId,
      actor_id: actorId,
      from_mbs: fromMbs,
      video_id: videoId,
    },
  };

  const form = {
    av: ctx.userID,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "useCometVideoEditorCopyrightCheckMutation",
    server_timestamps: true,
    variables: JSON.stringify(variables),
    doc_id: "32092344190411312",
    fb_api_analytics_tags: JSON.stringify(["qpl_active_flow_ids=884152905"]),
  };

  const response = await defaultFuncs
    .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
    .then(parseAndCheckLogin(ctx, defaultFuncs));

  const outArr = Array.isArray(response) ? response : [response];
  const out = (outArr[0] ?? response) as {
    data?: {
      xfb_cpx_composer_copyright_pre_check_mutation?: {
        response?: string;
        video?: {
          id?: string;
          copyright_precheck_progress?: {
            percentage?: number;
            early_return_result?: {
              found_early_violation?: boolean;
              early_violation_result?: unknown;
            };
          };
        };
      };
    };
    errors?: Array<unknown>;
    error?: unknown;
  };

  if (out.errors || out.error) {
    throw new Error(`Failed to start copyright check: ${JSON.stringify(out.errors || out.error)}`);
  }

  const mutationData = out.data?.xfb_cpx_composer_copyright_pre_check_mutation;
  if (!mutationData) {
    throw new Error("Invalid response from copyright check mutation");
  }

  return mutationData.response || videoId;
}

async function checkCopyrightProgress(
  defaultFuncs: DefaultFuncs,
  ctx: Context,
  videoId: string
): Promise<{
  percentage: number;
  found_early_violation: boolean;
  early_violation_result: unknown;
  copyright_match_details: unknown[];
  is_finished: boolean;
}> {
  const variables = {
    videoID: videoId,
  };

  const form = {
    av: ctx.userID,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "CometVideoEditorCopyrightCheckDetailsLiveQueryUpdaterQuery",
    server_timestamps: true,
    variables: JSON.stringify(variables),
    doc_id: "24740975925605526",
    fb_api_analytics_tags: JSON.stringify(["qpl_active_flow_ids=884152905"]),
  };

  const response = await defaultFuncs
    .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
    .then(parseAndCheckLogin(ctx, defaultFuncs));

  const outArr = Array.isArray(response) ? response : [response];
  const out = (outArr[0] ?? response) as {
    data?: {
      video?: {
        id?: string;
        copyright_precheck_progress?: {
          percentage?: number;
          early_return_result?: {
            found_early_violation?: boolean;
            early_violation_result?: unknown;
          };
        };
        if_copyright_precheck_is_finished?: {
          id?: string;
          copyright_precheck_match_details?: {
            copyright_match_details?: unknown[];
          };
        } | null;
      };
    };
    errors?: Array<unknown>;
    error?: unknown;
  };

  if (out.errors || out.error) {
    throw new Error(`Failed to check copyright progress: ${JSON.stringify(out.errors || out.error)}`);
  }

  const videoData = out.data?.video;
  if (!videoData) {
    throw new Error("Invalid response from copyright check query");
  }

  const progress = videoData.copyright_precheck_progress || {};
  const percentage = progress.percentage || 0;
  const earlyReturn = progress.early_return_result || {};
  const finished = videoData.if_copyright_precheck_is_finished;

  return {
    percentage,
    found_early_violation: earlyReturn.found_early_violation || false,
    early_violation_result: earlyReturn.early_violation_result || null,
    copyright_match_details: finished?.copyright_precheck_match_details?.copyright_match_details || [],
    is_finished: percentage >= 100 && finished !== null,
  };
}

async function waitForCopyrightCheck(
  defaultFuncs: DefaultFuncs,
  ctx: Context,
  videoId: string,
  maxWaitTime: number,
  pollInterval: number
): Promise<CopyrightCheckResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const progress = await checkCopyrightProgress(defaultFuncs, ctx, videoId);

    if (progress.is_finished) {
      return {
        video_id: videoId,
        percentage: progress.percentage,
        found_early_violation: progress.found_early_violation,
        early_violation_result: progress.early_violation_result,
        copyright_match_details: progress.copyright_match_details,
        is_finished: true,
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout - return current progress
  const progress = await checkCopyrightProgress(defaultFuncs, ctx, videoId);
  return {
    video_id: videoId,
    percentage: progress.percentage,
    found_early_violation: progress.found_early_violation,
    early_violation_result: progress.early_violation_result,
    copyright_match_details: progress.copyright_match_details,
    is_finished: progress.is_finished,
  };
}

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (options: CheckVideoCopyrightOptions | CheckVideoCopyrightCallback, callback?: CheckVideoCopyrightCallback) => Promise<CopyrightCheckResult> {
  return async function checkVideoCopyright(
    options: CheckVideoCopyrightOptions | CheckVideoCopyrightCallback,
    callback?: CheckVideoCopyrightCallback
  ): Promise<CopyrightCheckResult> {
    let resolveFunc: (value: CopyrightCheckResult) => void = () => {};
    let rejectFunc: (reason?: unknown) => void = () => {};

    const returnPromise = new Promise<CopyrightCheckResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    let opts: CheckVideoCopyrightOptions;
    if (typeof options === "function") {
      const error = new Error("videoId is required");
      callback?.(error);
      rejectFunc(error);
      return returnPromise;
    } else {
      opts = options || {};
    }

    if (!opts.videoId) {
      const error = new Error("videoId is required");
      callback?.(error);
      rejectFunc(error);
      return returnPromise;
    }

    const cb: CheckVideoCopyrightCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    (async () => {
      try {
        const videoId = opts.videoId;
        const actorId = opts.actorId || ctx.userID;
        const fromMbs = opts.fromMbs !== undefined ? opts.fromMbs : false;
        const maxWaitTime = opts.maxWaitTime || DEFAULT_MAX_WAIT_TIME;
        const pollInterval = opts.pollInterval || DEFAULT_POLL_INTERVAL;

        // Step 1: Start copyright check
        await startCopyrightCheck(defaultFuncs, ctx, videoId, actorId, fromMbs);

        // Step 2: Poll until finished
        const result = await waitForCopyrightCheck(defaultFuncs, ctx, videoId, maxWaitTime, pollInterval);

        cb(null, result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        cb(error);
      }
    })();

    return returnPromise;
  };
}
