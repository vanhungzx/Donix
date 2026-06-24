import type {
  Command,
  CommandOnCallContext,
} from "@types";

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}p${String(r).padStart(2, "0")}s` : `${m}p`;
}

function tsVN(ts: number): string {
  return new Date(ts).toLocaleString("vi-VN", {
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh"
  });
}

const spambanCommand: Command = {
  name: "spamban",
  alias: ["spamban"],
  version: "2.0.0",
  role: 3,
  desc: "Ban người dùng hoặc nhóm nếu spam bot",
  guide:
    "   - Tự động kiểm soát spam theo mức độ\n" +
    "   - >10 lệnh/người/phút: Ban user theo cấp số nhân\n" +
    "   - >20–40 lệnh/nhóm/phút hoặc burst: Ban nhóm theo cấp số nhân\n" +
    "   - Admin/Owner miễn trừ\n",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { reply, event, args, threadData, userData } = ctx;
    const { threadID, senderID, mentions, messageReply } = event;
    const now = Date.now();

    const state = global.__SPAM || { threads: {}, users: {} };
    const sub = (args[0] || "").toLowerCase();

    if (sub === "user" || sub === "u") {
      let target = senderID;

      const mentionID = mentions && Object.values(mentions)[0];
      if (mentionID) target = String(mentionID);
      else if (messageReply?.senderID) target = String(messageReply.senderID);
      else if (args[1]) target = String(args[1]).replace(/\D/g, "") || senderID;

      const uRec = await userData.get(target);
      const rawUBan: any = (uRec as any)?.banned;
      const uBan: any =
        rawUBan && typeof rawUBan === "object"
          ? (rawUBan.until || rawUBan.reason || rawUBan.time
            ? rawUBan
            : (rawUBan.auto || rawUBan[Object.keys(rawUBan)[0]]))
          : null;
      const uState = state.users?.[target]?.[threadID];

      const windowMs = 60000;
      const burstMs = 3000;
      const perMin = uState
        ? uState.events.filter((t) => t > now - windowMs).length
        : 0;
      const burst = uState
        ? uState.events.filter((t) => t > now - burstMs).length
        : 0;
      const name = uRec?.name || "Người dùng";
      const left =
        uBan?.until && uBan.until > now ? fmt(uBan.until - now) : null;

      const lines: string[] = [];
      lines.push(`📊 SPAMBAN • User`);
      lines.push(`${name} (${target})`);
      lines.push(
        `Cấm: ${uBan
          ? `${uBan.reason} • Đến: ${tsVN(uBan.until)} • Còn: ${left}`
          : "Không"
        }`
      );
      lines.push(`Strikes: ${uState?.strikes || 0}`);
      lines.push(`1p: ${perMin} • Burst3s: ${burst}`);
      await reply(lines.join("\n"));
      return;
    }

    const tRec = await threadData.get(threadID);
    const rawTBan: any = (tRec as any)?.banned;
    const tBan: any =
      rawTBan && typeof rawTBan === "object"
        ? (rawTBan.until || rawTBan.reason || rawTBan.time
          ? rawTBan
          : (rawTBan.auto || rawTBan[Object.keys(rawTBan)[0]]))
        : null;
    const th = state.threads?.[threadID];

    const windowMs = 60000;
    const burstMs = 3000;
    const perMinThread = th
      ? th.events.filter((t) => t > now - windowMs).length
      : 0;
    const burstThread = th
      ? th.events.filter((t) => t > now - burstMs).length
      : 0;
    const uniqUsers = th
      ? Array.from(th.uniq?.entries() || []).filter(
        ([, ts]) => ts > now - windowMs
      ).length
      : 0;
    const topRepeated = th
      ? Math.max(
        0,
        ...Array.from(th.bodies?.values() || []).map((a) =>
          a.filter((t) => t > now - windowMs).length
        )
      )
      : 0;
    const leftT =
      tBan?.until && tBan.until > now ? fmt(tBan.until - now) : null;

    const lines: string[] = [];
    lines.push(`📊 SPAMBAN • Thread`);
    lines.push(`ThreadID: ${threadID}`);
    lines.push(
      `Cấm: ${tBan
        ? `${tBan.reason} • Đến: ${tsVN(tBan.until)} • Còn: ${leftT}`
        : "Không"
      }`
    );
    lines.push(`Strikes: ${th?.strikes || 0}`);
    lines.push(
      `1p: ${perMinThread} • Burst3s: ${burstThread} • Uniq1p: ${uniqUsers} • LặpMax1p: ${topRepeated}`
    );
    await reply(lines.join("\n"));
    return;
  },
};

export default spambanCommand;
