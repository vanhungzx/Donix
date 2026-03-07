import utils, { type Client, type Context, type DefaultFuncs } from "../../../request/formatters/helpers";

type GlobalCallback = (err: Error | null, msg?: unknown) => void;
type ContextWithGlobalOptions = Context & { options?: Context["options"] };

interface ActivitiesDelta {
  class?: string;
  type?: string;
  link?: unknown;
  [key: string]: unknown;
}

export default (
  _def: DefaultFuncs,
  _client: Client,
  _ctx: ContextWithGlobalOptions,
  delta: unknown,
  callback: GlobalCallback
): void => {
  const handledTypes = new Set([
    "change_thread_theme",
    "change_thread_nickname",
    "change_thread_icon",
    "change_thread_quick_reaction",
    "change_thread_admins",
    "group_poll",
    "joinable_group_link_mode_change",
    "magic_words",
    "change_thread_approval_mode",
    "messenger_call_log",
    "participant_joined_group_call",
    "change_thread_approval_mode",
    "joinable_group_link_reset"
  ]);

  try {
    const d = (delta && typeof delta === "object" ? (delta as ActivitiesDelta) : null);
    if (!d) return;

    if (
      (d.class === "AdminTextMessage" && typeof d.type === "string" && handledTypes.has(d.type)) ||
      (d.class === "JoinableMode" && Boolean(d.link))
    ) {
      try {
        const fmtMsg = utils.formatDeltaEvent(d as never);
        return callback(null, fmtMsg);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return callback(error);
      }
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("Error in activities.ts:", error);
    return callback(error);
  }
};
