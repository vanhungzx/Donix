import fs from "fs-extra";
import moment from "moment-timezone";
import path from "path";
import { STORAGE_BANK, STORAGE_BANK_DATA } from "../../../storagePath";
import type { Logger, UserDataStore } from "../types";
import { TZ } from "../utils";
import { BANK, procAcc, type ProcAccResult } from "./processor";

export async function initBank(
  logger: Logger | undefined,
  userData: UserDataStore
): Promise<() => void> {
  const accDir = STORAGE_BANK();
  const metaDir = STORAGE_BANK_DATA();
  const mark = path.join(metaDir, "last_update.json");
  const legacyMark = path.join(process.cwd(), "bot", "data", "bank", "data", "last_update.json");
  const periodMs = Math.max(1, Number(BANK.H_PER_D || 24)) * 3600000;
  const maxSteps = Math.max(1, Number(BANK.MAX_STEPS || 14));
  const conc = Math.max(1, Number(BANK.CONC || 10));
  let running = false;

  await fs.ensureDir(accDir);
  await fs.ensureDir(metaDir);

  // Migrate legacy meta mark (bot/data/bank/data) -> storage/bank/data
  try {
    if (!(await fs.pathExists(mark)) && (await fs.pathExists(legacyMark))) {
      await fs.ensureDir(path.dirname(mark));
      await fs.move(legacyMark, mark, { overwrite: false });
      // try cleanup empty legacy dirs
      try {
        await fs.remove(path.join(process.cwd(), "bot", "data", "bank", "data"));
      } catch { }
    }
  } catch { }

  const processStep = async (stepTs: number) => {
    const dh = await fs.opendir(accDir);
    const pool = new Set<Promise<any>>();
    const results: ProcAccResult[] = [];
    for await (const de of dh) {
      if (!de.isFile()) continue;
      if (!de.name.endsWith(".json")) continue;
      const fp = path.join(accDir, de.name);
      const p = procAcc(fp, stepTs, logger || console, userData)
        .then(r => results.push(r))
        .catch(() => null)
        .finally(() => pool.delete(p));
      pool.add(p);
      if (pool.size >= conc) await Promise.race(pool);
    }
    await Promise.all([...pool]);
    const depCred = results.reduce((s, r) => s + (r?.depositCredit || 0n), 0n);
    const lni = results.reduce((s, r) => s + (r?.loanInterest || 0n), 0n);
    const locks = results.reduce((s, r) => s + (r?.didLock ? 1 : 0), 0);
    logger?.info?.("BANK", `[BƯỚC ${moment(stepTs).tz(TZ).format("DD/MM/YYYY HH:mm:ss")}] → TK: ${results.length} → Lãi gửi: +${depCred.toLocaleString()}đ → Lãi vay: +${lni.toLocaleString()}đ → Khóa: ${locks}`);
  };

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const ts = Date.now();
      let last = 0;
      if (await fs.pathExists(mark)) {
        const m = await fs.readJson(mark).catch(() => ({} as any));
        last = Number(m.timestamp) || 0;
      }
      const alignedNow = ts - (ts % periodMs);
      if (!last || last > alignedNow) {
        last = alignedNow - periodMs;
        await fs.writeJson(mark, { timestamp: last });
      }
      const steps = Math.min(Math.floor((alignedNow - last) / periodMs), maxSteps);
      if (steps <= 0) {
        running = false;
        return;
      }
      logger?.info?.("BANK", "Bắt đầu cập nhật");
      for (let s = 0; s < steps; s++) {
        const stepTs = last + (s + 1) * periodMs;
        await processStep(stepTs);
        await fs.writeJson(mark, { timestamp: stepTs });
      }
      logger?.info?.("BANK", "Hoàn tất cập nhật");
    } catch {
    } finally {
      running = false;
    }
  };

  const tmr = setInterval(tick, BANK.INT);
  await tick();
  return () => clearInterval(tmr);
}
