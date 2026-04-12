import fs from "fs-extra";
import path from "path";
import type { Logger, UserDataStore, Maybe } from "../types";

export const BANK = { INT: 3600000, H_PER_D: 24, MAX_STEPS: 14, CONC: 12, LOAN_GRACE: 259200000 } as const;

export type ProcAccResult = {
  changed: boolean;
  depositCredit: bigint;
  loanInterest: bigint;
  didLock: boolean;
  file: string;
};

const toBI = (v: unknown): bigint => {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  } catch { }
  return 0n;
};

const depositDailyBps = (bal: bigint): number => {
  if (bal >= 100_000_000n) return 30;
  if (bal >= 10_000_000n) return 25;
  if (bal >= 1_000_000n) return 20;
  return 10;
};

const loanDailyBps = (amt: bigint): number => {
  if (amt >= 50_000_000n) return 50;
  if (amt >= 10_000_000n) return 40;
  return 30;
};

export async function procAcc(
  fp: string,
  stepTs: number,
  log: Logger | Console | undefined,
  uStore: UserDataStore
): Promise<ProcAccResult> {
  try {
    const d = await fs.readJson(fp).catch(() => null as Maybe<any>);
    if (!d) return { changed: false, depositCredit: 0n, loanInterest: 0n, didLock: false, file: path.basename(fp) };

    const file = path.basename(fp);
    const uid = file.replace(".json", "");
    const name = (await uStore?.getName?.(uid)) || file;

    d.money = toBI(d.money ?? 0).toString();
    d.loan = toBI(d.loan ?? 0).toString();

    let money = toBI(d.money);
    let loan = toBI(d.loan);

    let depositCredit = 0n;
    let loanInterest = 0n;
    let didLock = false;
    let changed = false;

    if (money > 0n) {
      const bps = depositDailyBps(money);
      const g = (money * BigInt(bps)) / 10_000n;
      if (g > 0n) {
        money += g;
        depositCredit = g;
        d.transactions = Array.isArray(d.transactions) ? d.transactions : [];
        d.transactions.push({ type: "interest_deposit_daily", amount: g.toString(), timestamp: stepTs });
        d.lastDepositCredit = stepTs;
        log?.info?.("BANK", `[LÃI GỬI NGÀY] ${name} → ${bps}bps → +${g.toLocaleString()}đ → Số dư: ${money.toLocaleString()}đ`);
        changed = true;
      }
    }

    if (loan > 0n) {
      d.loanDate = d.loanDate || stepTs;
      const lbps = loanDailyBps(loan);
      const li = (loan * BigInt(lbps)) / 10_000n;
      if (li > 0n) {
        loan += li;
        loanInterest = li;
        d.transactions = Array.isArray(d.transactions) ? d.transactions : [];
        d.transactions.push({ type: "interest_loan_daily", amount: li.toString(), timestamp: stepTs });
        d.lastLoanTs = stepTs;
        log?.info?.("BANK", `[LÃI VAY] ${name} → ${lbps}bps → +${li.toLocaleString()}đ → Dư nợ: ${loan.toLocaleString()}đ`);
        changed = true;
      }
      if (stepTs - Number(d.loanDate || stepTs) > BANK.LOAN_GRACE && !d.isLocked) {
        d.isLocked = true;
        d.lockReason = "Quá hạn thanh toán khoản vay";
        d.creditScore = Math.max(0, Number(d.creditScore || 100) - 20);
        didLock = true;
        changed = true;
        log?.warn?.("BANK", `[KHÓA TÀI KHOẢN] ${name} → Lý do: ${d.lockReason} → Điểm: ${d.creditScore} → Nợ: ${loan.toLocaleString()}đ`);
      }
    }

    if (changed) {
      d.money = money.toString();
      d.loan = loan.toString();
      await fs.writeJson(fp, d, { spaces: 2 });
    }

    return { changed, depositCredit, loanInterest, didLock, file };
  } catch {
    return { changed: false, depositCredit: 0n, loanInterest: 0n, didLock: false, file: path.basename(fp) };
  }
}
