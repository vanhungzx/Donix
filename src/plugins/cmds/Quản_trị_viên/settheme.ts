import type { Command } from "@types";

type Callback = (err: Error | null, data?: unknown) => void;

interface AttachmentLike {
  url?: string;
}

interface ThemeItem {
  id: string;
  name: string;
}

interface GeneratedTheme {
  id: string;
  accessibility_label?: string;
}

type ThemeClient = {
  setTheme?: (
    themeID: string,
    threadID: string,
    callback?: Callback
  ) => Promise<unknown>;
  setThemeFromImage?: (
    imagePath: string | Buffer,
    threadID: string,
    callback?: Callback
  ) => Promise<unknown>;
  getTheme?: (callback?: (err: Error | null, data?: ThemeItem[]) => void) => Promise<ThemeItem[]>;
  createThemeAI?: (
    prompt: string,
    callback?: (err: Error | null, data?: GeneratedTheme) => void
  ) => Promise<GeneratedTheme>;
  generateAIThemes?: (
    prompt: string,
    callback?: (err: Error | null, data?: GeneratedTheme[]) => void
  ) => Promise<GeneratedTheme[] | undefined>;
};

const isUrl = (text: string): boolean => /^https?:\/\//i.test(text.trim());
const isNumericThemeId = (text: string): boolean => /^\d{6,}$/.test(text.trim());

const normText = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const pickBestThemeByName = (themes: ThemeItem[], query: string): ThemeItem | null => {
  const q = normText(query);
  if (!q) return null;

  const exact = themes.find((t) => normText(t.name) === q);
  if (exact) return exact;

  const include = themes.find((t) => normText(t.name).includes(q));
  if (include) return include;

  const reverseInclude = themes.find((t) => q.includes(normText(t.name)));
  if (reverseInclude) return reverseInclude;

  return null;
};

const command: Command = {
  name: "settheme",
  version: "1.2.0",
  role: 3,
  desc: "Doi theme bang anh, ID, random, hoac prompt AI",
  guide:
    "{pn} <url_anh> | reply anh\n" +
    "{pn} <theme_id>\n" +
    "{pn} random\n" +
    "{pn} <mo ta bang chu> (tu tao AI theme)",
  prefix: true,
  onCall: async ({ client, event, args, reply }) => {
    const threadID = String(event.threadID);
    const themeClient = client as unknown as ThemeClient;

    const replyAttachments =
      (event.messageReply as { attachments?: AttachmentLike[] } | undefined)?.attachments || [];
    const messageAttachments = (event.attachments as AttachmentLike[] | undefined) || [];
    const attachmentUrl = replyAttachments[0]?.url || messageAttachments[0]?.url;
    const inputText = args.join(" ").trim();

    const setTheme = themeClient.setTheme;
    const setThemeFromImage = themeClient.setThemeFromImage;
    if (!setTheme) {
      await reply("API setTheme chua san sang.");
      return;
    }

    try {
      // 1) Reply anh / attachment anh uu tien cao nhat.
      if (attachmentUrl) {
        if (!setThemeFromImage) {
          await reply("API setThemeFromImage chua ho tro.");
          return;
        }
        await setThemeFromImage(attachmentUrl, threadID);
        await reply("Da doi theme bang anh thanh cong!");
        return;
      }

      if (!inputText) {
        await reply(
          "Vui long reply anh, gui URL anh, theme ID, random, hoac mo ta prompt de tao AI theme."
        );
        return;
      }

      // 2) URL => set theme tu anh.
      if (isUrl(inputText)) {
        if (!setThemeFromImage) {
          await reply("API setThemeFromImage chua ho tro.");
          return;
        }
        await setThemeFromImage(inputText, threadID);
        await reply("Da doi theme bang anh thanh cong!");
        return;
      }

      // 3) random => random theme co san.
      if (normText(inputText) === "random") {
        await setTheme("random", threadID);
        await reply("Da doi random theme thanh cong!");
        return;
      }

      // 4) theme id so.
      if (isNumericThemeId(inputText)) {
        await setTheme(inputText, threadID);
        await reply("Da doi theme theo ID thanh cong!");
        return;
      }

      // 5) Thu tim theo ten theme co san truoc.
      if (typeof themeClient.getTheme === "function") {
        const themes = await themeClient.getTheme();
        const matched = pickBestThemeByName(themes || [], inputText);
        if (matched?.id) {
          await setTheme(matched.id, threadID);
          await reply(`Da doi theme: ${matched.name}`);
          return;
        }
      }

      // 6) Khong match duoc => tao AI theme theo prompt.
      let aiThemeId: string | null = null;
      let aiThemeName = "AI theme";

      if (typeof themeClient.createThemeAI === "function") {
        const generated = await themeClient.createThemeAI(inputText);
        aiThemeId = generated?.id || null;
        aiThemeName = generated?.accessibility_label || aiThemeName;
      } else if (typeof themeClient.generateAIThemes === "function") {
        const generatedList = await themeClient.generateAIThemes(inputText);
        const first = Array.isArray(generatedList) ? generatedList[0] : null;
        aiThemeId = first?.id || null;
        aiThemeName = first?.accessibility_label || aiThemeName;
      }

      if (!aiThemeId) {
        await reply(
          "Khong nhan dien duoc anh/ID/theme co san, va API AI theme chua kha dung."
        );
        return;
      }

      await setTheme(aiThemeId, threadID);
      await reply(`Da tao va ap dung ${aiThemeName} tu prompt: ${inputText}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await reply(`Doi theme that bai: ${message}`);
    }
  }
};

export default command;
