import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../logger";
import { getCleanupManager } from "./cleanupManager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_VIDEOS = 5;
const INTERVAL_MS = 5000;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MIN_FILE_SIZE = 1024;
const CATS = ["vdgai", "vdanime", "vdcos", "vdtrai"] as const;

type Cat = (typeof CATS)[number];

const DIRS: Record<Cat, string> = {
  vdgai: path.join(__dirname, "../../../storage/media/vdgai"),
  vdanime: path.join(__dirname, "../../../storage/media/vdanime"),
  vdcos: path.join(__dirname, "../../../storage/media/vdcos"),
  vdtrai: path.join(__dirname, "../../../storage/media/vdtrai"),
};

type UploadResult = { video_id?: string | number; audio_id?: string | number;[key: string]: any } | undefined;

interface Client {
  uploadAttachment?: (input: string | string[]) => Promise<UploadResult[]>;
  ruploadAttachment?: (inputs: unknown) => Promise<Array<{ type?: string; uploadId?: string; mediaId?: string | number }>>;
}

interface InitOptions {
  client: Client;
}

export default function initHandleUpload({ client }: InitOptions): void {

  (globalThis as any).Donix = (globalThis as any).Donix || {};
  // Giảm MAX_ARRAY_SIZE để hạn chế cache
  const MAX_ARRAY_SIZE = 20; // Giảm từ 30 xuống 20
  for (const c of CATS) {
    const arr = (globalThis as any).Donix[c];
    if (Array.isArray(arr)) {
      // Cleanup ngay nếu quá lớn
      if (arr.length > MAX_ARRAY_SIZE) {
        (globalThis as any).Donix[c] = arr.slice(-MAX_ARRAY_SIZE);
      } else {
        (globalThis as any).Donix[c] = arr;
      }
    } else {
      (globalThis as any).Donix[c] = [];
    }
  }

  const used = new Map<Cat, Set<string>>(CATS.map(c => [c, new Set<string>()]));
  let running = false;
  let timer: NodeJS.Timeout | null = setInterval(tick, INTERVAL_MS) as unknown as NodeJS.Timeout;

  // Đăng ký cleanup timer
  const cleanupManager = getCleanupManager();
  cleanupManager.registerTimer("handle-upload-timer", timer, 4);

  // Unref để không giữ process alive
  if (timer && typeof (timer as any).unref === "function") {
    (timer as any).unref();
  }

  async function validateVideo(filePath: string): Promise<{ valid: boolean; error?: string }> {
    try {

      await fs.access(filePath);

      const stats = await fs.stat(filePath);

      if (stats.size < MIN_FILE_SIZE) {
        return { valid: false, error: `File quá nhỏ (${(stats.size / 1024).toFixed(2)}KB < ${(MIN_FILE_SIZE / 1024).toFixed(2)}KB)` };
      }

      if (stats.size > MAX_FILE_SIZE) {
        return { valid: false, error: `File quá lớn (${(stats.size / 1024 / 1024).toFixed(2)}MB > ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(2)}MB)` };
      }

      const handle = await fs.open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(Math.min(1024, stats.size));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);

        if (bytesRead === 0) {
          return { valid: false, error: "File rỗng hoặc không đọc được" };
        }

        const header = buffer.toString('ascii', 4, 8);
        if (bytesRead >= 8 && !header.includes('ftyp') && !header.includes('mdat') && !header.includes('moov')) {

          logger.warn(`Warning: ${path.basename(filePath)} may not be a valid MP4 (header: ${header})`);
        }
      } finally {
        await handle.close();
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err?.message || "Không thể kiểm tra file" };
    }
  }

  async function pickFiles(cat: Cat, n: number): Promise<{ name: string; filePath: string }[]> {
    try {
      const files = (await fs.readdir(DIRS[cat])).filter(f => f.endsWith(".mp4"));
      if (!files.length) return [];

      const u = used.get(cat) as Set<string>;
      let pool = files.filter(f => !u.has(f));

      if (!pool.length) {
        u.clear();
        pool = files.slice();
      }

      const out: { name: string; filePath: string }[] = [];
      const tmp = pool.slice();

      while (out.length < n && tmp.length) {
        const i = Math.floor(Math.random() * tmp.length);
        const name = tmp.splice(i, 1)[0];
        const fp = path.join(DIRS[cat], name);

        try {

          const validation = await validateVideo(fp);
          if (validation.valid) {
            out.push({ name, filePath: fp });
            u.add(name);
          } else {
            logger.warn(`Skipping invalid file ${name}: ${validation.error}`);
          }
        } catch {

        }
      }

      return out;
    } catch {
      return [];
    }
  }

  async function handle(cat: Cat): Promise<void> {
    const list = ((globalThis as any).Donix[cat] as [string, string][]) || [];
    const need = Math.max(1, MAX_VIDEOS - list.length);
    const picks = await pickFiles(cat, need);

    if (!picks.length) return;

    if (!client || typeof client.uploadAttachment !== "function") {
      return;
    }

    const uploadAttachment = client.uploadAttachment;
    const MAX_CONCURRENT_UPLOADS = 2;
    let uploadIndex = 0;

    const uploadWorker = async (): Promise<void> => {
      while (uploadIndex < picks.length) {
        const myIndex = uploadIndex++;
        const pick = picks[myIndex];
        let uploads: any[] | null = null;

        try {

          const validation = await validateVideo(pick.filePath);
          if (!validation.valid) {
            logger.warn(`Skipping upload of ${pick.name}: ${validation.error}`);
            continue;
          }

          uploads = await uploadAttachment(pick.filePath);

          if (Array.isArray(uploads) && uploads.length > 0) {
            const vids: [string, string][] = uploads
              .filter(x => x?.video_id)
              .map(x => ["video_id", String(x!.video_id)]);

            if (vids.length > 0) {
              const arr = (globalThis as any).Donix[cat];
              arr.push(...vids);

              if (arr.length > MAX_ARRAY_SIZE) {
                (globalThis as any).Donix[cat] = arr.slice(-MAX_ARRAY_SIZE);
              }
              logger.success(`Uploaded ${cat}: ${pick.name} (${vids.length} video(s))`);
            }
            // Safety fallback: if uploadAttachment returns no video_id, try rupload directly.
            // (In normal flows uploadAttachment already falls back to ruploadAttachment.)
            if (vids.length === 0 && client && typeof client.ruploadAttachment === "function") {
              try {
                const rres = await client.ruploadAttachment(pick.filePath);
                const rvids: [string, string][] = (Array.isArray(rres) ? rres : [])
                  .filter(r => r?.type === "video" && (r.mediaId ?? r.uploadId))
                  .map(r => ["video_id", String(r.mediaId ?? r.uploadId)]);
                if (rvids.length > 0) {
                  const arr = (globalThis as any).Donix[cat];
                  arr.push(...rvids);
                  if (arr.length > MAX_ARRAY_SIZE) {
                    (globalThis as any).Donix[cat] = arr.slice(-MAX_ARRAY_SIZE);
                  }
                  logger.success(`Rupload fallback ${cat}: ${pick.name} (${rvids.length} video(s))`);
                }
              } catch (e: any) {
                logger.warn(`Rupload fallback failed for ${pick.name}: ${e?.message || e}`);
              }
            }
          }

          uploads = null;

          if (myIndex < picks.length - 1 && myIndex % MAX_CONCURRENT_UPLOADS === MAX_CONCURRENT_UPLOADS - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } catch (err: any) {

          uploads = null;

          const errMsg = err?.message || "";
          if (errMsg.includes("not ready") || errMsg.includes("auto-login") || errMsg.includes("session not ready")) {
            return;
          }

          logger.error(`Error uploading ${pick.name}: ${errMsg}`);
        }
      }
    };

    const workers = Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, picks.length) }, () => uploadWorker());
    await Promise.all(workers);

  }

  async function tick(): Promise<void> {
    if (running) return;
    running = true;

    try {
      const needCats = CATS.filter(c => (((globalThis as any).Donix[c] as [string, string][])?.length || 0) < MAX_VIDEOS);

      for (const cat of needCats) {
        await handle(cat);
      }
    } catch {

    } finally {
      running = false;
    }
  }

  process.on("exit", () => {
    if (timer) clearInterval(timer);
    timer = null;
  });
}
