import type { Command, CommandOnCallContext, CommandOnReplyContext, ReplyData } from "@types";
import { randomUUID } from "node:crypto";
import { fetchMessengerMusicPickerOptimalQuery } from "../../../API/detail/action/fetchMessengerMusicPickerOptimalQuery";
import { getConfig } from "../../../core/configManager";

interface MusicPickerSong {
  audio_cluster_id: string;
  title: string;
  subtitle: string;
  duration_ms: number;
  cover_small: string;
  cover_large: string;
  progressive_url: string | null;
  is_explicit: boolean;
  has_lyrics: boolean;
  highlights?: number[];
}

interface MusicPickerResult {
  songs: MusicPickerSong[];
  end_cursor: string | null;
  has_next_page: boolean;
}

async function fetchNotesMusic(
  searchText: string | null,
  pageSize: number,
  endCursor: string | null,
  browseSessionId: string
): Promise<MusicPickerResult> {
  const config = getConfig();
  const token =
    config.token?.EAAD ||
    config.token?.EAAD6V7 ||
    config.token?.EAAAAU ||
    Object.values(config.token || {})[0];

  if (!token) {
    throw new Error(
      "Thiếu access token (EAAD/EAAD6V7/EAAAAU) trong config, không thể lấy danh sách nhạc ghi chú."
    );
  }

  const result = await fetchMessengerMusicPickerOptimalQuery({
    accessToken: String(token),
    searchText,
    pageSize,
    endCursor,
    browseSessionId,
    locale: "vi_VN",
  });

  const data = result.raw?.data?.msgr_music_picker_container_v2;
  if (!data || !Array.isArray(result.songs)) {
    throw new Error("Không lấy được danh sách nhạc ghi chú từ GraphQL.");
  }

  const songs: MusicPickerSong[] = result.songs.map((s: any) => ({
    audio_cluster_id: String(s.audio_cluster_id),
    title: s.title?.text || "",
    subtitle: s.subtitle?.text || "",
    duration_ms: s.duration_ms ?? 0,
    cover_small: s.cover_artwork?.uri || "",
    cover_large: s.cover_artwork_large?.uri || "",
    progressive_url: s.progressive_download?.url || null,
    is_explicit: !!s.is_explicit,
    has_lyrics: !!s.has_lyrics,
    highlights: Array.isArray(s.highlights) ? s.highlights : [],
  }));

  return {
    songs,
    end_cursor: data.page_info?.end_cursor ?? null,
    has_next_page: !!data.page_info?.has_next_page,
  };
}

interface MusicNoteOptions {
  audioClusterId: string;
  text: string;
  songStartTimeMs?: number;
  durationSec?: number;
  alacornSessionId?: string | null;
  browseSessionId: string;
  privacy?: number;
}



function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pickSmartStartTime(song: MusicPickerSong): number {
  const dur = song.duration_ms || 0;
  if (Array.isArray(song.highlights) && song.highlights.length > 0) {
    const h = song.highlights[0] ?? 0;

    if (dur > 0) {
      const maxStart = Math.max(0, dur - 30000);
      return Math.max(0, Math.min(h, maxStart));
    }
    return Math.max(0, h);
  }
  if (dur <= 0) return 0;

  const raw = Math.floor(dur * 0.25);
  const maxStart = Math.max(0, dur - 30000);
  return Math.max(0, Math.min(raw, maxStart));
}

const command: Command = {
  name: "ghichu",
  alias: ["musicnote", "ghichu"],
  version: "1.0.0",
  role: 3,
  category: "Tiện ích",
  desc: "Tìm nhạc và đăng ghi chú nhạc (Messenger Notes)",
  guide:
    "{pn}note [từ khóa]\n" +
    "- B1: Bot gửi danh sách bài hát.\n" +
    "- B2: Reply số (1-n) + ' | ' + nội dung ghi chú để đăng.\n" +
    "Ví dụ: 1 | ....",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply, main, commandName } = ctx;

    const mode = args[0]?.toLowerCase?.() || "";
    const isFast =
      mode === "fast" ||
      mode === "nhanh" ||
      mode === "auto";

    const searchText = isFast
      ? null
      : args.length
        ? args.join(" ")
        : null;

    const quickNoteText =
      isFast && args.length > 1 ? args.slice(1).join(" ").trim() || "...." : "....";

    const browseSessionId = randomUUID();

    try {
      const result = await fetchNotesMusic(searchText, 20, "0", browseSessionId);
      if (!result.songs.length) {
        await reply("❎ Không tìm thấy bài hát nào phù hợp.");
        return;
      }

      if (isFast) {
        const songs = result.songs;
        const song = songs[Math.floor(Math.random() * songs.length)] as MusicPickerSong;

        const createMusicNote = (ctx.client as any).createMusicNote as
          | ((audioClusterId: string | number, text: string, options?: Partial<MusicNoteOptions>) => Promise<boolean>)
          | undefined;

        if (typeof createMusicNote !== "function") {
          await reply("❌ API createMusicNote chưa được nạp vào client.");
          return;
        }

        const songStartTimeMs = pickSmartStartTime(song);

        await createMusicNote(song.audio_cluster_id, quickNoteText, {
          browseSessionId,
          songStartTimeMs,
        });

        await reply(
          `✅ Đã đăng ghi chú nhạc nhanh:\n🎵 ${song.title}\n👤 ${song.subtitle || "Không rõ"}\n📝 Nội dung: ${quickNoteText}`
        );
        return;
      }

      const lines = result.songs.map((s, i) => {
        const idx = i + 1;
        const time = formatDuration(s.duration_ms);
        const explicit = s.is_explicit ? " (E)" : "";
        return `${idx}. ${s.title}${explicit}\n   ${s.subtitle || "Không rõ"} • ${time}`;
      });

      const header =
        "🎵 DANH SÁCH NHẠC GHI CHÚ\n" +
        (searchText ? `🔎 Từ khóa: ${searchText}\n` : "") +
        "💭 Reply: số (1-" +
        result.songs.length +
        ") + ' | ' + nội dung ghi chú để đăng\n" +
        "Ví dụ: 1 | ....\n\n";

      const sent = (await reply({
        body: header + lines.join("\n\n"),
      })) as { messageID?: string } | undefined;

      if (sent?.messageID) {
        main.onReply.set(sent.messageID, {
          commandName,
          messageID: sent.messageID,
          author: event.senderID,
          case: "musicNotePick",
          data: {
            songs: result.songs as unknown as Record<string, string | number | boolean | null | undefined>,
            browseSessionId,
          } as unknown as Record<string, string | number | boolean | null | undefined>,
        });
      }
    } catch (e: unknown) {
      const error = e as { message?: string };
      await reply(`❌ Lỗi khi lấy danh sách nhạc ghi chú: ${error.message || "Không rõ lỗi"}`);
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, Reply, main, reply } = ctx;
    const { senderID, body } = event;

    if (!Reply) return;
    const replyData = Reply as ReplyData & {
      case?: string;
      data?: { songs?: MusicPickerSong[]; browseSessionId?: string };
    };

    if (replyData.case !== "musicNotePick") return;

    if (senderID !== replyData.author) {
      await reply("⚠️ Bạn không phải người dùng lệnh này.");
      return;
    }

    const raw = (body || "").trim();
    if (!raw) {
      await reply("⚠️ Vui lòng nhập số bài hát (vd: 1 hoặc 1 | nội dung).");
      return;
    }

    const parts = raw.split("|", 2);
    const idxPart = parts[0]?.trim() || "";
    const notePart = parts[1];

    const index = parseInt(idxPart, 10);
    if (!Number.isFinite(index) || index < 1) {
      await reply(`❌ Số không hợp lệ: "${idxPart}"`);
      return;
    }

    const songs = replyData.data?.songs || [];
    const browseSessionId = replyData.data?.browseSessionId || randomUUID();
    const song = songs[index - 1];

    if (!song) {
      await reply("❌ Không tìm thấy bài hát với số đó.");
      return;
    }

    const text = (notePart || "....").trim() || "....";

    try {
      const createMusicNote = (client as any).createMusicNote as
        | ((audioClusterId: string | number, text: string, options?: Partial<MusicNoteOptions>) => Promise<boolean>)
        | undefined;

      if (typeof createMusicNote !== "function") {
        await reply("❌ API createMusicNote chưa được nạp vào client.");
        return;
      }

      await createMusicNote(song.audio_cluster_id, text, { browseSessionId });

      if (main.onReply && replyData.messageID && typeof main.onReply.delete === "function") {
        main.onReply.delete(replyData.messageID);
      }

      await reply(
        `✅ Đã đăng ghi chú nhạc:\n🎵 ${song.title}\n👤 ${song.subtitle || "Không rõ"}\n📝 Nội dung: ${text}`
      );
    } catch (e: any) {
      await reply(
        `❌ Lỗi khi đăng ghi chú nhạc: ${e?.message || e || "Không rõ lỗi"}`
      );
    }
  },
};

export default command;
