import { createCanvas } from "canvas";
import fs from "fs-extra";
import { join } from "path";
import { STORAGE_BANK, TEMP_DIR } from "../../../core/storagePath";

async function getPrefix(threadId: string, threadData: any, config: any) {
  const thread = await threadData.get(threadId);
  return thread?.data?.PREFIX || config.PREFIX;
}

const parseAmount = (v: any): bigint | null => {
  if (v == null) return null;
  if (typeof v === "bigint") return v;

  const s0 = String(v).trim();
  if (!s0) return null;

  // Remove common formatting and trailing currency.
  let s = s0.replace(/,/g, "");
  s = s.replace(/\s*(vnđ|vnd)\s*$/i, "");

  const m = s.match(/^(-?\d+(?:\.\d+)?)(?:\s*([a-zA-ZÀ-ỹ]+))?$/i);
  if (!m) return null;

  const numPart = m[1];
  const unitRaw = (m[2] || "").toLowerCase();

  const negative = numPart.startsWith("-");
  const unsignedNum = negative ? numPart.slice(1) : numPart;
  const [intStr, fracStr = ""] = unsignedNum.split(".");
  if (!/^\d+$/.test(intStr) || (fracStr && !/^\d+$/.test(fracStr))) return null;

  const frac2 = fracStr.padEnd(2, "0").slice(0, 2);
  const cents = BigInt(intStr) * 100n + BigInt(frac2);

  const mul =
    unitRaw === "b" || unitRaw === "tỷ" || unitRaw === "ty"
      ? 1_000_000_000n
      : unitRaw === "m" || unitRaw === "tr" || unitRaw === "triệu"
        ? 1_000_000n
        : unitRaw === "k" || unitRaw === "ngàn" || unitRaw === "ngan" || unitRaw === "nghìn" || unitRaw === "nghin"
          ? 1_000n
          : unitRaw === ""
            ? 1n
            : null;

  if (mul === null) return null;
  const out = (cents * mul) / 100n;
  return negative ? -out : out;
};

const fmtVND = (a: bigint | number | string): string => {
  const x = typeof a === "bigint" ? a : BigInt(a || 0);
  const s = x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return s + " VNĐ";
};

const toBI = (v: any): bigint => {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  } catch { }
  return 0n;
};

const fmtPct = (bps: number): string => (bps / 100).toFixed(2);

// Prevent Infinity/NaN in chart rendering when money is extremely large.
const MAX_SAFE_BI = 9_007_199_254_740_991n; // Number.MAX_SAFE_INTEGER
const toFiniteNumber = (bi: bigint): number => {
  const abs = bi < 0n ? -bi : bi;
  const sign = bi < 0n ? -1 : 1;
  if (abs > MAX_SAFE_BI) return sign * Number(MAX_SAFE_BI);
  return Number(bi);
};

// Percent with exactly 1 decimal, computed via BigInt.
const fmtPercent1 = (saved: bigint, target: bigint): string => {
  if (target <= 0n) return "0.0";
  // percent = saved/target*100
  // percentWith1Decimal = percent * 10 => saved*1000/target
  const scaled10 = (saved * 1000n) / target;
  const intPart = scaled10 / 10n;
  const decPart = scaled10 % 10n;
  return `${intPart.toString()}.${decPart.toString()}`;
};

const isValidURL = (s: string): boolean => {
  try {
    const u = new URL(String(s));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const dayMs = 24 * 60 * 60 * 1000;
const baseDir = STORAGE_BANK();
const tempDir = TEMP_DIR();
fs.ensureDirSync(baseDir);
fs.ensureDirSync(tempDir);

const FEE = { bps: 50, min: 500n, max: 50000n };
const calcFee = (amt: bigint | number | string): bigint => {
  const f = (toBI(amt) * BigInt(FEE.bps)) / 10000n;
  return f < FEE.min ? FEE.min : f > FEE.max ? FEE.max : f;
};

interface BankTransaction {
  type: string;
  amount: bigint;
  timestamp: number;
  [key: string]: any;
}

interface BankTerm {
  id: string;
  principal: bigint;
  start: number;
  days: number;
  rateBps: number;
}

interface BankGoal {
  name: string;
  target: bigint;
  saved: bigint;
  created: number;
}

interface BankRequestIncoming {
  id: string;
  from: string;
  amount: bigint;
  note: string;
  ts: number;
}

interface BankRequestOutgoing {
  id: string;
  to: string;
  amount: bigint;
  note: string;
  ts: number;
  status: string;
  actionTs: number | null;
}

interface BankData {
  money: bigint;
  loan: bigint;
  isLocked: boolean;
  lockReason: string;
  loanDate: number | null;
  lastLoanTs: number | null;
  lastDepositCredit: any;
  creditScore: number;
  transactions: BankTransaction[];
  accountCreated: number;
  lastDaily: number;
  dailyStreak: number;
  terms: BankTerm[];
  goals: BankGoal[];
  requestsIncoming: BankRequestIncoming[];
  requestsOutgoing: BankRequestOutgoing[];
}

const readBank = (id: string): BankData | null => {
  const p = join(baseDir, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return {
    money: toBI(raw.money),
    loan: toBI(raw.loan),
    isLocked: !!raw.isLocked,
    lockReason: String(raw.lockReason || ""),
    loanDate: raw.loanDate || null,
    lastLoanTs: raw.lastLoanTs || raw.loanDate || null,
    lastDepositCredit: raw.lastDepositCredit || null,
    creditScore: Math.max(0, Math.min(100, parseInt(raw.creditScore || 100, 10))),
    transactions: Array.isArray(raw.transactions) ? raw.transactions.map((t: any) => ({ ...t, amount: toBI(t.amount) })) : [],
    accountCreated: raw.accountCreated || Date.now(),
    lastDaily: raw.lastDaily || 0,
    dailyStreak: parseInt(raw.dailyStreak || 0, 10) || 0,
    terms: Array.isArray(raw.terms) ? raw.terms.map((t: any) => ({ ...t, principal: toBI(t.principal), start: t.start, days: t.days, rateBps: t.rateBps, id: t.id })) : [],
    goals: Array.isArray(raw.goals) ? raw.goals.map((g: any) => ({ name: String(g.name || ""), target: toBI(g.target), saved: toBI(g.saved), created: g.created || Date.now() })) : [],
    requestsIncoming: Array.isArray(raw.requestsIncoming) ? raw.requestsIncoming.map((r: any) => ({ id: String(r.id), from: String(r.from), amount: toBI(r.amount), note: String(r.note || ""), ts: r.ts || Date.now() })) : [],
    requestsOutgoing: Array.isArray(raw.requestsOutgoing) ? raw.requestsOutgoing.map((r: any) => ({ id: String(r.id), to: String(r.to), amount: toBI(r.amount), note: String(r.note || ""), ts: r.ts || Date.now(), status: r.status || "pending", actionTs: r.actionTs || null })) : []
  };
};

const writeBank = (id: string, data: BankData): void => {
  const p = join(baseDir, `${id}.json`);
  const out = {
    ...data,
    money: data.money.toString(),
    loan: data.loan.toString(),
    transactions: data.transactions.map(t => ({ ...t, amount: t.amount.toString() })),
    terms: data.terms.map(t => ({ ...t, principal: t.principal.toString() })),
    goals: data.goals.map(g => ({ ...g, target: g.target.toString(), saved: g.saved.toString() })),
    requestsIncoming: data.requestsIncoming.map(r => ({ ...r, amount: r.amount.toString() })),
    requestsOutgoing: data.requestsOutgoing.map(r => ({ ...r, amount: r.amount.toString() }))
  };
  fs.writeFileSync(p, JSON.stringify(out, null, 2));
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

const compoundDays = (principal: bigint, bps: number, days: number): bigint => {
  let total = BigInt(principal);
  const base = 10000n;
  const step = base + BigInt(bps);
  for (let i = 0; i < days; i++) total = (total * step) / base;
  return total;
};

const compoundDepositTiered = (principal: bigint, days: number): bigint => {
  let p = BigInt(principal);
  const base = 10000n;
  for (let i = 0; i < days; i++) {
    const b = BigInt(depositDailyBps(p));
    p = (p * (base + b)) / base;
  }
  return p;
};

const compoundLoanTiered = (principal: bigint, days: number): bigint => {
  let p = BigInt(principal);
  const base = 10000n;
  for (let i = 0; i < days; i++) {
    const b = BigInt(loanDailyBps(p));
    p = (p * (base + b)) / base;
  }
  return p;
};

const termRateBps = (days: number, principal: bigint | number | string): number => {
  const p = toBI(principal);
  let r = days >= 30 ? 60 : days >= 14 ? 45 : days >= 7 ? 40 : 35;
  if (p >= 100_000_000n) r += 5;
  return r;
};

const genId = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36);

const settleMatureTerms = (bankData: BankData): bigint => {
  const now = Date.now();
  const matured: BankTerm[] = [];
  const rest: BankTerm[] = [];
  for (const t of bankData.terms) {
    const end = t.start + t.days * dayMs;
    if (now >= end) matured.push(t);
    else rest.push(t);
  }
  let credited = 0n;
  for (const t of matured) {
    const total = compoundDays(t.principal, t.rateBps, t.days);
    bankData.money += total;
    bankData.transactions.push({ type: "term_mature", amount: total, timestamp: Date.now(), termId: t.id });
    credited += total;
  }
  bankData.terms = rest;
  return credited;
};

const buildHistoryPages = async (bankData: BankData, userData: any) => {
  const mapType: Record<string, string> = {
    deposit: "Gửi tiền",
    withdraw: "Rút tiền",
    interest: "Tiền lãi",
    interest_deposit_daily: "Lãi gửi (ngày)",
    interest_loan_daily: "Lãi vay (ngày)",
    loan: "Vay tiền",
    payment: "Trả nợ",
    transfer_in: "Nhận chuyển khoản",
    transfer_out: "Chuyển khoản đi",
    daily_reward: "Thưởng điểm danh",
    term_open: "Mở sổ kỳ hạn",
    term_mature: "Đáo hạn kỳ hạn",
    term_close_early: "Tất toán trước hạn",
    goal_set: "Tạo mục tiêu",
    goal_add: "Nạp mục tiêu",
    goal_take: "Rút mục tiêu",
    goal_done: "Hoàn thành mục tiêu",
    request_incoming: "Yêu cầu nhận tiền",
    request_paid: "Thanh toán yêu cầu",
    fee: "Phí giao dịch"
  };
  const neg = new Set(["withdraw", "payment", "transfer_out", "interest_loan_daily", "term_open", "goal_add", "request_paid", "fee"]);
  const fmtTx = async (t: BankTransaction): Promise<string> => {
    const type = mapType[t.type] || t.type;
    const date = new Date(t.timestamp).toLocaleString();
    const sign = neg.has(t.type) ? "-" : "+";
    let extra = "";
    if (t.type === "transfer_in" && t.sender) {
      const nm = (await userData.getName(String(t.sender))) || "Người dùng";
      extra = ` từ ${nm} (${t.sender})`;
    } else if (t.type === "transfer_out" && t.recipient) {
      const nm = (await userData.getName(String(t.recipient))) || "Người dùng";
      extra = ` đến ${nm} (${t.recipient})`;
    } else if (t.type === "term_open") {
      extra = ` (${t.days} ngày, ${fmtPct(t.rateBps)}%/ngày)`;
    } else if (t.type === "term_mature") {
      extra = ` (kỳ hạn ${t.termId})`;
    } else if (t.type === "term_close_early") {
      extra = ` (kỳ hạn ${t.termId})`;
    } else if (t.type === "goal_set") {
      extra = ` "${t.name}"`;
    } else if (t.type === "goal_add" || t.type === "goal_take" || t.type === "goal_done") {
      extra = ` "${t.name}"`;
    } else if (t.type === "request_incoming") {
      const nm = (await userData.getName(String(t.from))) || "Người dùng";
      extra = ` từ ${nm} (${t.from})`;
    } else if (t.type === "request_paid") {
      const nm = (await userData.getName(String(t.to))) || "Người dùng";
      extra = ` cho ${nm} (${t.to})`;
    } else if (t.type === "fee" && t.reason) {
      extra = ` (${t.reason})`;
    }
    return `${type}${extra}: ${sign}${fmtVND(t.amount)} - ${date}`;
  };
  const items = await Promise.all(bankData.transactions.slice().reverse().map(fmtTx));
  const per = 10;
  const pages: string[] = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per).join("\n"));
  return { pages, per, total: items.length };
};

const fmtDate = (ts: number): string =>
  new Date(ts).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

const command = {
  name: "bank",
  alias: ["bank"],
  version: "2.0.0",
  role: 0,
  desc: "Ngân hàng: gửi/rút, vay/trả, chuyển khoản, mục tiêu, kỳ hạn, yêu cầu, lịch trả nợ, phí giao dịch, lịch sử, top, thống kê",
  guide: `{pn} -r|register
{pn} check|info
{pn} gui|gửi <số tiền|all|%>
{pn} rut|rút <số tiền|all|%>
{pn} vay <số tiền|all|%>
{pn} tra|trano <số tiền|all>
{pn} pay|transfer|chuyển <@id|uid|reply> <số tiền|all|%>
{pn} split <@id...> <số tiền|all|%>
{pn} request <@id|uid|reply> <số tiền> [ghi chú]
{pn} requests
{pn} accept <requestId>
{pn} decline <requestId>
{pn} goal set <tên> <mục tiêu>
{pn} goal add <tên> <số tiền>
{pn} goal take <tên> <số tiền>
{pn} goal list
{pn} goal del <tên>
{pn} term open <số tiền> <ngày>
{pn} term list
{pn} term claim [id]
{pn} term close <id> [force]
{pn} plan [days]
{pn} trend [days=30]
{pn} history [page]
{pn} daily
{pn} stats
{pn} top
{pn} toploan
{pn} topstreak`,
  cd: 0,
  prefix: true,
  onCall: async ({ bot, reply, event, args, userData, threadData, config, main }: any) => {
    const senderID = String(event.senderID);
    const prefix = await getPrefix(event.threadID, threadData, config);
    const MIN_DEPOSIT = 1_000n;
    const MIN_LOAN = 1_000_000n;
    const MAX_LOAN = 500_000_000n;

    if (args[0] === "-r" || args[0] === "register") {
      const exist = readBank(senderID);
      if (exist) return reply("⚠️ Bạn đã có tài khoản Bank");
      const init: BankData = {
        money: 0n,
        loan: 0n,
        isLocked: false,
        lockReason: "",
        loanDate: null,
        lastLoanTs: null,
        lastDepositCredit: null,
        creditScore: 100,
        transactions: [],
        accountCreated: Date.now(),
        lastDaily: 0,
        dailyStreak: 0,
        terms: [],
        goals: [],
        requestsIncoming: [],
        requestsOutgoing: []
      };
      writeBank(senderID, init);
      return reply(`🏦 Chào mừng đến với Donix Bank!\n- STK: ${senderID}\n- Hạn mức vay: ${fmtVND(MIN_LOAN)} - ${fmtVND(MAX_LOAN)}\n- Điểm tín dụng: 100\nGửi ít nhất ${fmtVND(MIN_DEPOSIT)} để bắt đầu hưởng lãi`);
    }

    const bankData = readBank(senderID);
    if (!bankData) return reply(`⚠️ Vui lòng tạo tài khoản bằng lệnh ${prefix}bank -r`);
    if (bankData.isLocked && args[0] !== "unlock" && args[0] !== "check" && args[0] !== "info") return reply(`🔒 Tài khoản bị khóa\n- Lý do: ${bankData.lockReason}\n- Điểm tín dụng: ${bankData.creditScore}`);

    switch ((args[0] || "").toLowerCase()) {
      case "check":
      case "info": {
        const depBps = depositDailyBps(bankData.money);
        const depDaily = (bankData.money * BigInt(depBps)) / 10000n;
        const lbps = loanDailyBps(bankData.loan);
        let addDays = 0;
        let loanTotal = bankData.loan;
        if (bankData.loan > 0n) {
          const ref = bankData.lastLoanTs || bankData.loanDate || Date.now();
          addDays = Math.max(0, Math.floor((Date.now() - ref) / dayMs));
          loanTotal = compoundLoanTiered(bankData.loan, addDays);
        }
        const name = await userData.getName(senderID);
        const nextDailyAt = bankData.lastDaily ? bankData.lastDaily + dayMs : 0;
        const leftMs = Math.max(0, nextDailyAt - Date.now());
        const leftHr = Math.floor(leftMs / 3600000);
        const leftMin = Math.floor((leftMs % 3600000) / 60000);
        const termLines = bankData.terms.length ? bankData.terms.map(t => {
          const end = t.start + t.days * dayMs;
          const left = Math.max(0, Math.ceil((end - Date.now()) / dayMs));
          return `- ${t.id}: ${fmtVND(t.principal)} | ${t.days} ngày | ${fmtPct(t.rateBps)}%/ngày | Còn ${left} ngày`;
        }).join("\n") : "Không có";
        const goals = bankData.goals.length
          ? bankData.goals.map(g => `- ${g.name}: ${fmtVND(g.saved)}/${fmtVND(g.target)} (${fmtPercent1(g.saved, g.target)}%)`).join("\n")
          : "Không có";
        return reply(
          `[ THÔNG TIN TÀI KHOẢN ]\n\n` +
          `💰 Tiền gửi:\n- Số dư: ${fmtVND(bankData.money)}\n- Lãi suất: ${fmtPct(depBps)}%/ngày\n- Lãi/ngày: +${fmtVND(depDaily)}\n\n` +
          `💸 Khoản vay:\n- Dư nợ gốc hiện ghi: ${fmtVND(bankData.loan)}\n- Tổng nợ ước tính đến hiện tại: ${fmtVND(loanTotal)}\n- Lãi suất: ${fmtPct(lbps)}%/ngày\n- Ngày bù lãi: ${addDays}\n\n` +
          `🏷️ Kỳ hạn:\n${termLines}\n\n` +
          `🎯 Mục tiêu:\n${goals}\n\n` +
          `📊 Điểm tín dụng: ${bankData.creditScore}\n👤 Chủ tài khoản: ${name || "Chưa cập nhật"}\n📅 Ngày tạo: ${new Date(bankData.accountCreated).toLocaleString()}\n🔒 Trạng thái: ${bankData.isLocked ? `Bị khóa (${bankData.lockReason})` : "Hoạt động"}\n📈 Tổng giao dịch: ${bankData.transactions.length}\n🎯 Daily streak: ${bankData.dailyStreak}\n⏱️ Daily cooldown: ${leftMs ? `${leftHr}h${leftMin}m` : "Có thể nhận"}`
        );
      }

      case "gui":
      case "gửi":
      case "send": {
        const a = args[1];
        if (!a) return reply("⚠️ Nhập số tiền muốn gửi");
        const balance = toBI(await userData.checkMoney(senderID));
        let amt: bigint;
        if (String(a).endsWith("%")) {
          const p = parseInt(String(a), 10);
          if (!Number.isFinite(p) || p <= 0 || p > 100) return reply("⚠️ Phần trăm không hợp lệ");
          amt = (balance * BigInt(p)) / 100n;
        } else if (String(a).toLowerCase() === "all") {
          amt = balance;
        } else {
          const bi = parseAmount(a);
          if (bi == null || bi <= 0n) return reply("⚠️ Số tiền không hợp lệ");
          amt = bi;
        }
        if (amt < MIN_DEPOSIT) return reply(`⚠️ Tối thiểu ${fmtVND(MIN_DEPOSIT)}`);
        if (amt > balance) return reply("⚠️ Số dư không đủ");
        await userData.delMoney(senderID, amt);
        bankData.money += amt;
        if (bankData.creditScore < 100) {
          let add = 0;
          if (amt >= 100_000_000n) add = 5;
          else if (amt >= 10_000_000n) add = 3;
          else if (amt >= 1_000_000n) add = 1;
          bankData.creditScore = Math.min(100, bankData.creditScore + add);
        }
        bankData.transactions.push({ type: "deposit", amount: amt, timestamp: Date.now() });
        writeBank(senderID, bankData);
        return reply(`✅ Đã gửi ${fmtVND(amt)} vào tài khoản${bankData.creditScore < 100 ? `\n📈 Điểm tín dụng: ${bankData.creditScore}` : ""}`);
      }

      case "rút":
      case "rut": {
        const a = args[1];
        if (!a) return reply("⚠️ Nhập số tiền muốn rút");
        let amt: bigint;
        if (String(a).endsWith("%")) {
          const p = parseInt(String(a), 10);
          if (!Number.isFinite(p) || p <= 0 || p > 100) return reply("⚠️ Phần trăm không hợp lệ");
          amt = (bankData.money * BigInt(p)) / 100n;
        } else if (String(a).toLowerCase() === "all") {
          amt = bankData.money;
        } else {
          const bi = parseAmount(a);
          if (bi == null || bi <= 0n) return reply("⚠️ Số tiền không hợp lệ");
          amt = bi;
        }
        if (amt > bankData.money) return reply("⚠️ Số dư không đủ");
        bankData.money -= amt;
        await userData.addMoney(senderID, amt);
        bankData.transactions.push({ type: "withdraw", amount: amt, timestamp: Date.now() });
        writeBank(senderID, bankData);
        return reply(`✅ Đã rút ${fmtVND(amt)} từ tài khoản`);
      }

      case "vay": {
        const a = args[1];
        if (!a) return reply("⚠️ Nhập số tiền muốn vay");
        if (bankData.loan > 0n) return reply("⚠️ Bạn đang có khoản vay chưa thanh toán");
        if (bankData.creditScore < 50) return reply("⚠️ Cần điểm tín dụng ≥ 50 để vay");
        const loanCount = bankData.transactions.filter(t => t.type === "loan").length;
        if (loanCount >= 3) return reply("⚠️ Đã đạt giới hạn vay (3 lần)");
        let maxLoan = MAX_LOAN;
        if (bankData.creditScore < 80) maxLoan = (MAX_LOAN * 50n) / 100n;
        if (bankData.creditScore < 60) maxLoan = (MAX_LOAN * 30n) / 100n;
        let amt: bigint;
        if (String(a).endsWith("%")) {
          const p = parseInt(String(a), 10);
          if (!Number.isFinite(p) || p <= 0 || p > 100) return reply("⚠️ Phần trăm không hợp lệ");
          amt = (maxLoan * BigInt(p)) / 100n;
        } else if (String(a).toLowerCase() === "all") {
          amt = maxLoan;
        } else {
          const bi = parseAmount(a);
          if (bi == null || bi <= 0n) return reply("⚠️ Số tiền không hợp lệ");
          amt = bi;
        }
        if (amt < MIN_LOAN || amt > maxLoan) return reply(`⚠️ Với tín dụng ${bankData.creditScore}, vay từ ${fmtVND(MIN_LOAN)} đến ${fmtVND(maxLoan)}`);
        let deduct = 5;
        if (amt >= 100_000_000n) deduct = 15;
        else if (amt >= 50_000_000n) deduct = 10;
        bankData.creditScore = Math.max(0, bankData.creditScore - deduct);
        bankData.loan = amt;
        bankData.money += amt;
        bankData.loanDate = Date.now();
        bankData.lastLoanTs = bankData.loanDate;
        bankData.transactions.push({ type: "loan", amount: amt, timestamp: Date.now() });
        writeBank(senderID, bankData);
        return reply(`✅ Đã giải ngân ${fmtVND(amt)}\n📊 Điểm tín dụng: ${bankData.creditScore} (-${deduct})\n📝 Số lần vay: ${loanCount + 1}/3`);
      }

      case "trả":
      case "trano": {
        if (bankData.loan <= 0n) return reply("⚠️ Bạn không có khoản vay nào");
        const ref2 = bankData.lastLoanTs || bankData.loanDate || Date.now();
        const addDays2 = Math.max(0, Math.floor((Date.now() - ref2) / dayMs));
        const total = compoundLoanTiered(bankData.loan, addDays2);
        let pay: bigint;
        if ((args[1] || "").toLowerCase() === "all") pay = total;
        else {
          const bi = parseAmount(args[1] || "");
          pay = bi == null || bi <= 0n ? total : bi;
        }
        if (pay > total) return reply("⚠️ Số tiền vượt quá khoản vay (gốc+lãi)");
        const wallet = toBI(await userData.checkMoney(senderID));
        if (pay > wallet) return reply("⚠️ Số dư ví không đủ");
        const interestAccrued = total - bankData.loan;
        const interestPaid = pay > interestAccrued ? interestAccrued : pay;
        const principalPaid = pay - interestPaid;
        await userData.delMoney(senderID, pay);
        bankData.loan = bankData.loan - principalPaid;
        if (bankData.loan <= 0n) {
          bankData.loan = 0n;
          bankData.loanDate = null;
          bankData.lastLoanTs = null;
          bankData.creditScore = Math.min(100, bankData.creditScore + 10);
        } else {
          bankData.lastLoanTs = Date.now();
        }
        bankData.transactions.push({ type: "payment", amount: pay, timestamp: Date.now() });
        writeBank(senderID, bankData);
        return reply(`✅ Đã thanh toán ${fmtVND(pay)}\n- Lãi đã trả: ${fmtVND(interestPaid)}\n- Gốc đã trả: ${fmtVND(principalPaid)}\n- Dư nợ gốc còn lại: ${fmtVND(bankData.loan)}`);
      }

      case "pay":
      case "chuyển":
      case "transfer": {
        let id: string | null;
        let amountArg: any;
        if (event.type === "message_reply" && event.messageReply?.senderID) {
          id = String(event.messageReply.senderID);
          amountArg = args[1];
        } else if (Object.keys(event.mentions || {}).length > 0) {
          id = String(Object.keys(event.mentions)[0]).replace(/\&mibextid=ZbWKwL/g, "");
          amountArg = args[2];
        } else {
          id = args[1] ? (isValidURL(args[1]) ? String(await bot.api.getUID(args[1])) : /^\d+$/.test(args[1]) ? String(args[1]) : null) : null;
          amountArg = args[2];
        }
        if (!id || !amountArg) return reply("⚠️ Nhập ID người nhận và số tiền");
        if (id === senderID) return reply("⚠️ Không thể tự chuyển cho chính mình");
        const recData = readBank(id);
        if (!recData) return reply("⚠️ Người nhận chưa có tài khoản ngân hàng");
        let amt: bigint;
        if (String(amountArg).endsWith("%")) {
          const p = parseInt(String(amountArg), 10);
          if (!Number.isFinite(p) || p <= 0 || p > 100) return reply("⚠️ Phần trăm không hợp lệ");
          amt = (bankData.money * BigInt(p)) / 100n;
        } else if (String(amountArg).toLowerCase() === "all") {
          amt = bankData.money;
        } else {
          const bi = parseAmount(amountArg);
          if (bi == null || bi <= 0n) return reply("⚠️ Số tiền không hợp lệ");
          amt = bi;
        }
        const fee = calcFee(amt);
        if (amt + fee > bankData.money) return reply("⚠️ Số dư không đủ (bao gồm phí)");
        bankData.money -= amt + fee;
        recData.money += amt;
        const recName = (await userData.getName(id)) || "Người dùng";
        const sndName = (await userData.getName(senderID)) || "Người dùng";
        recData.transactions.push({ type: "transfer_in", amount: amt, sender: senderID, senderName: sndName, timestamp: Date.now() });
        bankData.transactions.push({ type: "transfer_out", amount: amt, recipient: id, recipientName: recName, timestamp: Date.now() });
        bankData.transactions.push({ type: "fee", amount: fee, timestamp: Date.now(), reason: "transfer" });
        writeBank(id, recData);
        writeBank(senderID, bankData);
        return reply(`✅ Đã chuyển ${fmtVND(amt)} cho ${recName} (ID: ${id})\n💸 Phí: ${fmtVND(fee)}`);
      }

      case "split": {
        const mentionIds = Object.keys(event.mentions || {});
        if (!mentionIds.length) return reply("⚠️ Tag người nhận");
        const amountArg = args.find((a: string) => /^\d|all|\d+%$/i.test(a));
        if (!amountArg) return reply("⚠️ Nhập số tiền");
        let total: bigint;
        if (String(amountArg).endsWith("%")) {
          const p = parseInt(String(amountArg), 10);
          if (!Number.isFinite(p) || p <= 0 || p > 100) return reply("⚠️ Phần trăm không hợp lệ");
          total = bankData.money === 0n ? 0n : (bankData.money * BigInt(p)) / 100n;
        } else if (String(amountArg).toLowerCase() === "all") {
          total = bankData.money;
        } else {
          const bi = parseAmount(amountArg);
          if (bi == null || bi <= 0n) return reply("⚠️ Số tiền không hợp lệ");
          total = bi;
        }
        const n = BigInt(mentionIds.length);
        const each = total / n;
        if (each <= 0n) return reply("⚠️ Số tiền quá nhỏ");
        const fee = calcFee(each * n);
        if (each * n + fee > bankData.money) return reply("⚠️ Số dư không đủ (bao gồm phí)");
        bankData.money -= each * n + fee;
        for (const idRaw of mentionIds) {
          const id = String(idRaw);
          const rec = readBank(id);
          if (!rec) continue;
          rec.money += each;
          rec.transactions.push({ type: "transfer_in", amount: each, sender: senderID, senderName: await userData.getName(senderID), timestamp: Date.now() });
          writeBank(id, rec);
        }
        bankData.transactions.push({ type: "transfer_out", amount: each * n, recipient: "split", recipientName: "Split", timestamp: Date.now() });
        bankData.transactions.push({ type: "fee", amount: fee, timestamp: Date.now(), reason: "split" });
        writeBank(senderID, bankData);
        return reply(`✅ Đã chia ${fmtVND(each)} cho mỗi người (${mentionIds.length} người)\n💸 Phí: ${fmtVND(fee)}`);
      }

      case "request": {
        let id: string | null;
        let amountArg: any;
        let note: string;
        if (event.type === "message_reply" && event.messageReply?.senderID) {
          id = String(event.messageReply.senderID);
          amountArg = args[1];
          note = args.slice(2).join(" ") || "";
        } else if (Object.keys(event.mentions || {}).length > 0) {
          id = String(Object.keys(event.mentions)[0]).replace(/\&mibextid=ZbWKwL/g, "");
          amountArg = args[1];
          note = args.slice(2).join(" ") || "";
        } else {
          id = args[1] ? (isValidURL(args[1]) ? String(await bot.api.getUID(args[1])) : /^\d+$/.test(args[1]) ? String(args[1]) : null) : null;
          amountArg = args[2];
          note = args.slice(3).join(" ") || "";
        }
        if (!id || !amountArg) return reply("⚠️ Nhập người cần yêu cầu và số tiền");
        if (id === senderID) return reply("⚠️ Không thể yêu cầu chính mình");
        const recData = readBank(id);
        if (!recData) return reply("⚠️ Người nhận chưa có tài khoản ngân hàng");
        const amt = parseAmount(amountArg);
        if (amt == null || amt <= 0n) return reply("⚠️ Số tiền không hợp lệ");
        const rid = genId();
        recData.requestsIncoming.push({ id: rid, from: senderID, amount: amt, note, ts: Date.now() });
        bankData.requestsOutgoing.push({ id: rid, to: id, amount: amt, note, ts: Date.now(), status: "pending", actionTs: null });
        bankData.transactions.push({ type: "request_incoming", amount: 0n, timestamp: Date.now(), to: id, note, requestId: rid });
        writeBank(id, recData);
        writeBank(senderID, bankData);
        const nm = (await userData.getName(id)) || "Người dùng";
        return reply(`🧾 Đã gửi yêu cầu ${fmtVND(amt)} tới ${nm} (ID: ${id})\nID: ${rid}\n${note ? `Ghi chú: ${note}` : ""}`);
      }

      case "requests": {
        const incoming = bankData.requestsIncoming;
        const outgoing = bankData.requestsOutgoing;
        const incStr = incoming.length ? incoming.map((r, i) => `${i + 1}. ID: ${r.id} | Từ: ${r.from} | Số tiền: ${fmtVND(r.amount)}${r.note ? ` | ${r.note}` : ""}`).join("\n") : "Không có";
        const outStr = outgoing.length ? outgoing.map((r, i) => `${i + 1}. ID: ${r.id} | Đến: ${r.to} | ${fmtVND(r.amount)} | ${r.status}`).join("\n") : "Không có";
        return reply(`[ YÊU CẦU NHẬN TIỀN ]\n\nĐến bạn:\n${incStr}\n\nBạn đã gửi:\n${outStr}\n\nDùng: ${prefix}bank accept <id> hoặc ${prefix}bank decline <id>`);
      }

      case "accept": {
        const rid = args[1];
        if (!rid) return reply("⚠️ Nhập ID yêu cầu");
        const idx = bankData.requestsIncoming.findIndex(r => r.id === rid);
        if (idx < 0) return reply("⚠️ Không tìm thấy yêu cầu");
        const rq = bankData.requestsIncoming[idx];
        if (!rq) return reply("⚠️ Không tìm thấy yêu cầu");
        const wallet = toBI(await userData.checkMoney(senderID));
        if (wallet < rq.amount) return reply("⚠️ Số dư ví không đủ để thanh toán");
        await userData.delMoney(senderID, rq.amount);
        const toData = readBank(rq.from);
        if (!toData) return reply("⚠️ Người nhận không tồn tại");
        toData.money += rq.amount;
        toData.transactions.push({ type: "transfer_in", amount: rq.amount, sender: senderID, senderName: await userData.getName(senderID), timestamp: Date.now() });
        const outIdx = toData.requestsOutgoing.findIndex(r => r.id === rid);
        if (outIdx >= 0) {
          const outReq = toData.requestsOutgoing[outIdx];
          if (outReq) {
            outReq.status = "accepted";
            outReq.actionTs = Date.now();
          }
        }
        bankData.transactions.push({ type: "request_paid", amount: rq.amount, timestamp: Date.now(), to: rq.from });
        bankData.requestsIncoming.splice(idx, 1);
        writeBank(rq.from, toData);
        writeBank(senderID, bankData);
        return reply(`✅ Đã thanh toán ${fmtVND(rq.amount)} cho ${rq.from}`);
      }

      case "decline": {
        const rid = args[1];
        if (!rid) return reply("⚠️ Nhập ID yêu cầu");
        const idx = bankData.requestsIncoming.findIndex(r => r.id === rid);
        if (idx < 0) return reply("⚠️ Không tìm thấy yêu cầu");
        const rq = bankData.requestsIncoming[idx];
        if (!rq) return reply("⚠️ Không tìm thấy yêu cầu");
        const toData = readBank(rq.from);
        if (toData) {
          const outIdx = toData.requestsOutgoing.findIndex(r => r.id === rid);
          if (outIdx >= 0) {
            const outReq = toData.requestsOutgoing[outIdx];
            if (outReq) {
              outReq.status = "declined";
              outReq.actionTs = Date.now();
            }
            writeBank(rq.from, toData);
          }
        }
        bankData.requestsIncoming.splice(idx, 1);
        writeBank(senderID, bankData);
        return reply("✅ Đã từ chối yêu cầu");
      }

      case "goal": {
        const sub = (args[1] || "").toLowerCase();
        if (sub === "set") {
          const name = args[2];
          const target = parseAmount(args[3]);
          if (!name || target == null || target <= 0n) return reply("⚠️ Dùng: goal set <tên> <mục tiêu>");
          if (bankData.goals.find(g => g.name.toLowerCase() === name.toLowerCase())) return reply("⚠️ Tên mục tiêu đã tồn tại");
          bankData.goals.push({ name, target, saved: 0n, created: Date.now() });
          bankData.transactions.push({ type: "goal_set", amount: 0n, timestamp: Date.now(), name });
          writeBank(senderID, bankData);
          return reply(`🎯 Đã tạo mục tiêu "${name}" ${fmtVND(target)}`);
        } else if (sub === "add") {
          const name = args[2];
          const amt = parseAmount(args[3]);
          if (!name || amt == null || amt <= 0n) return reply("⚠️ Dùng: goal add <tên> <số tiền>");
          const g = bankData.goals.find(x => x.name.toLowerCase() === name.toLowerCase());
          if (!g) return reply("⚠️ Không tìm thấy mục tiêu");
          if (amt > bankData.money) return reply("⚠️ Số dư không đủ");
          bankData.money -= amt;
          g.saved += amt;
          bankData.transactions.push({ type: "goal_add", amount: amt, timestamp: Date.now(), name: g.name });
          let bonus = 0n;
          if (g.saved >= g.target) {
            bonus = g.target / 100n;
            if (bonus > 1_000_000n) bonus = 1_000_000n;
            bankData.money += bonus;
            bankData.transactions.push({ type: "goal_done", amount: bonus, timestamp: Date.now(), name: g.name });
          }
          writeBank(senderID, bankData);
          return reply(`✅ Đã nạp ${fmtVND(amt)} vào "${g.name}"${bonus > 0n ? `\n🎉 Hoàn thành! Thưởng ${fmtVND(bonus)}` : ""}`);
        } else if (sub === "take") {
          const name = args[2];
          const amt = parseAmount(args[3]);
          if (!name || amt == null || amt <= 0n) return reply("⚠️ Dùng: goal take <tên> <số tiền>");
          const g = bankData.goals.find(x => x.name.toLowerCase() === name.toLowerCase());
          if (!g) return reply("⚠️ Không tìm thấy mục tiêu");
          if (amt > g.saved) return reply("⚠️ Số tiền vượt quá số đã tiết kiệm");
          g.saved -= amt;
          bankData.money += amt;
          bankData.transactions.push({ type: "goal_take", amount: amt, timestamp: Date.now(), name: g.name });
          writeBank(senderID, bankData);
          return reply(`✅ Đã rút ${fmtVND(amt)} từ "${g.name}"`);
        } else if (sub === "list") {
          const s = bankData.goals.length
            ? bankData.goals.map(g => `- ${g.name}: ${fmtVND(g.saved)}/${fmtVND(g.target)} (${fmtPercent1(g.saved, g.target)}%)`).join("\n")
            : "Không có";
          return reply(`[ MỤC TIÊU ]\n${s}`);
        } else if (sub === "del") {
          const name = args[2];
          if (!name) return reply("⚠️ Dùng: goal del <tên>");
          const i = bankData.goals.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
          if (i < 0) return reply("⚠️ Không tìm thấy mục tiêu");
          const g = bankData.goals[i];
          if (!g) return reply("⚠️ Không tìm thấy mục tiêu");
          if (g.saved > 0n) bankData.money += g.saved;
          bankData.goals.splice(i, 1);
          writeBank(senderID, bankData);
          return reply(`🗑️ Đã xóa mục tiêu "${name}"${g.saved > 0n ? `, hoàn trả ${fmtVND(g.saved)}` : ""}`);
        } else {
          return reply("⚠️ Dùng: goal set|add|take|list|del");
        }
      }

      case "term": {
        const sub = (args[1] || "").toLowerCase();
        if (sub === "open") {
          const amt = parseAmount(args[2]);
          const days = Math.max(1, parseInt(args[3] || "0", 10) || 0);
          if (amt == null || amt <= 0n || days <= 0) return reply("⚠️ Dùng: term open <số tiền> <ngày>");
          if (amt > bankData.money) return reply("⚠️ Số dư không đủ");
          const rate = termRateBps(days, amt);
          const id = genId();
          bankData.money -= amt;
          bankData.terms.push({ id, principal: amt, start: Date.now(), days, rateBps: rate });
          bankData.transactions.push({ type: "term_open", amount: amt, timestamp: Date.now(), days, rateBps: rate, termId: id });
          writeBank(senderID, bankData);
          return reply(`📦 Mở kỳ hạn ${id}\n- Gốc: ${fmtVND(amt)}\n- Kỳ: ${days} ngày\n- Lãi: ${fmtPct(rate)}%/ngày`);
        } else if (sub === "list") {
          const s = bankData.terms.length ? bankData.terms.map(t => {
            const end = t.start + t.days * dayMs;
            const left = Math.max(0, Math.ceil((end - Date.now()) / dayMs));
            return `- ${t.id}: ${fmtVND(t.principal)} | ${t.days} ngày | ${fmtPct(t.rateBps)}%/ngày | Còn ${left} ngày`;
          }).join("\n") : "Không có";
          return reply(`[ KỲ HẠN ]\n${s}`);
        } else if (sub === "claim") {
          const id = args[2];
          if (id) {
            const i = bankData.terms.findIndex(t => t.id === id);
            if (i < 0) return reply("⚠️ Không tìm thấy kỳ hạn");
            const t = bankData.terms[i];
            if (!t) return reply("⚠️ Không tìm thấy kỳ hạn");
            const end = t.start + t.days * dayMs;
            if (Date.now() < end) return reply("⚠️ Chưa đến ngày đáo hạn");
            const total = compoundDays(t.principal, t.rateBps, t.days);
            bankData.money += total;
            bankData.transactions.push({ type: "term_mature", amount: total, timestamp: Date.now(), termId: t.id });
            bankData.terms.splice(i, 1);
            writeBank(senderID, bankData);
            return reply(`✅ Đã đáo hạn ${id}: +${fmtVND(total)}`);
          } else {
            const credited = settleMatureTerms(bankData);
            writeBank(senderID, bankData);
            return reply(credited > 0n ? `✅ Đã nhận ${fmtVND(credited)} từ các kỳ hạn đã đáo hạn` : "ℹ️ Chưa có kỳ hạn nào đáo hạn");
          }
        } else if (sub === "close") {
          const id = args[2];
          const force = String(args[3] || "").toLowerCase() === "force";
          if (!id) return reply("⚠️ Dùng: term close <id> [force]");
          const i = bankData.terms.findIndex(t => t.id === id);
          if (i < 0) return reply("⚠️ Không tìm thấy kỳ hạn");
          const t = bankData.terms[i];
          if (!t) return reply("⚠️ Không tìm thấy kỳ hạn");
          const end = t.start + t.days * dayMs;
          if (Date.now() >= end) {
            const total = compoundDays(t.principal, t.rateBps, t.days);
            bankData.money += total;
            bankData.transactions.push({ type: "term_mature", amount: total, timestamp: Date.now(), termId: t.id });
          } else {
            if (!force) return reply("⚠️ Chưa đến hạn, thêm 'force' để tất toán trước hạn (mất 2% gốc)");
            const back = t.principal - (t.principal * 2n) / 100n;
            bankData.money += back;
            bankData.transactions.push({ type: "term_close_early", amount: back, timestamp: Date.now(), termId: t.id });
          }
          bankData.terms.splice(i, 1);
          writeBank(senderID, bankData);
          return reply("✅ Đã tất toán");
        } else {
          return reply("⚠️ Dùng: term open|list|claim|close");
        }
      }

      case "plan": {
        if (bankData.loan <= 0n) return reply("⚠️ Bạn không có khoản vay nào");
        const ref = bankData.lastLoanTs || bankData.loanDate || Date.now();
        const addDays = Math.max(0, Math.floor((Date.now() - ref) / dayMs));
        const nowDebt = compoundLoanTiered(bankData.loan, addDays);
        const daysArg = parseInt(args[1] || "", 10);
        if (Number.isFinite(daysArg) && daysArg > 0) {
          const total = compoundLoanTiered(nowDebt, daysArg);
          return reply(`📅 Kế hoạch 1 lần\n- Hôm nay: ${fmtVND(nowDebt)}\n- Sau ${daysArg} ngày: ${fmtVND(total)}\n- Chênh lệch lãi: ${fmtVND(total - nowDebt)}`);
        }
        const d7 = compoundLoanTiered(nowDebt, 7);
        const d14 = compoundLoanTiered(nowDebt, 14);
        const d30 = compoundLoanTiered(nowDebt, 30);
        let remain = nowDebt;
        const week1Int = compoundLoanTiered(remain, 7) - remain;
        const p1 = remain / 3n + week1Int;
        remain = remain - remain / 3n;
        const week2Int = compoundLoanTiered(remain, 7) - remain;
        const p2 = remain / 2n + week2Int;
        remain = remain - remain / 2n;
        const week3Int = compoundLoanTiered(remain, 7) - remain;
        const p3 = remain + week3Int;
        const d1 = fmtDate(Date.now() + 7 * dayMs);
        const d2 = fmtDate(Date.now() + 14 * dayMs);
        const d3 = fmtDate(Date.now() + 21 * dayMs);
        return reply(
          `📅 Gợi ý lịch trả nợ\n` +
          `- Trả ngay: ${fmtVND(nowDebt)}\n` +
          `- Trả sau 7 ngày: ${fmtVND(d7)} (+${fmtVND(d7 - nowDebt)})\n` +
          `- Trả sau 14 ngày: ${fmtVND(d14)} (+${fmtVND(d14 - nowDebt)})\n` +
          `- Trả sau 30 ngày: ${fmtVND(d30)} (+${fmtVND(d30 - nowDebt)})\n\n` +
          `📆 Trả góp 3 kỳ (mỗi 7 ngày)\n` +
          `- ${d1}: ${fmtVND(p1)}\n` +
          `- ${d2}: ${fmtVND(p2)}\n` +
          `- ${d3}: ${fmtVND(p3)}\n` +
          `- Tổng ước tính: ${fmtVND(p1 + p2 + p3)}`
        );
      }

      case "trend": {
        const days = Math.max(7, Math.min(90, parseInt(args[1] || "30", 10) || 30));
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const startTs = start.getTime() - (days - 1) * dayMs;
        const incomeTypes = new Set(["deposit", "interest", "interest_deposit_daily", "transfer_in", "loan", "daily_reward", "term_mature", "goal_done"]);
        const spendTypes = new Set(["withdraw", "transfer_out", "payment", "interest_loan_daily", "term_open", "goal_add", "fee"]);
        const labels: string[] = [];
        const inc = new Array<number>(days).fill(0);
        const out = new Array<number>(days).fill(0);
        for (let i = 0; i < days; i++) {
          const d = new Date(startTs + i * dayMs);
          labels.push(d.getDate().toString().padStart(2, "0"));
        }
        for (const t of bankData.transactions) {
          if (!t) continue;
          const d0 = new Date(t.timestamp);
          const ts0 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
          if (ts0 < startTs) continue;
          const idx = Math.floor((ts0 - startTs) / dayMs);
          if (idx < 0 || idx >= days) continue;
          const val = toFiniteNumber(toBI(t.amount));
          const incVal = inc[idx];
          const outVal = out[idx];
          if (incomeTypes.has(t.type) && incVal !== undefined) inc[idx] = incVal + val;
          else if (spendTypes.has(t.type) && outVal !== undefined) out[idx] = outVal + val;
        }
        const W = 900, H = 360, L = 60, R = 20, T = 20, B = 40;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d") as any;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        const gx = (W - L - R) / (days - 1);
        const maxY = Math.max(1, ...inc, ...out);
        const gy = (H - T - B) / maxY;
        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const y = H - B - ((H - T - B) * i) / 4;
          ctx.beginPath();
          ctx.moveTo(L, y);
          ctx.lineTo(W - R, y);
          ctx.stroke();
        }
        ctx.fillStyle = "#111827";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        for (let i = 0; i < days; i += Math.ceil(days / 12)) {
          const x = L + i * gx;
          ctx.fillText(labels[i], x, H - 10);
        }
        const drawLine = (arr: number[], color: string) => {
          ctx.beginPath();
          for (let i = 0; i < days; i++) {
            const x = L + i * gx;
            const val = arr[i];
            if (val === undefined) continue;
            const y = H - B - val * gy;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        };
        drawLine(inc, "#16a34a");
        drawLine(out, "#ef4444");
        ctx.fillStyle = "#111827";
        ctx.font = "16px Arial";
        ctx.textAlign = "left";
        ctx.fillText("Thu nhập vs Chi tiêu theo ngày", L, T);
        ctx.fillStyle = "#16a34a";
        ctx.fillRect(W - 220, T + 8, 12, 12);
        ctx.fillStyle = "#111827";
        ctx.fillText("Thu nhập", W - 200, T + 18);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(W - 120, T + 8, 12, 12);
        ctx.fillStyle = "#111827";
        ctx.fillText("Chi tiêu", W - 100, T + 18);
        const imgPath = join(tempDir, `trend_${senderID}_${Date.now()}.png`);
        fs.writeFileSync(imgPath, canvas.toBuffer("image/png"));
        const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
        return reply({ body: `📈 Biểu đồ ${days} ngày\n- Tổng thu: ${fmtVND(BigInt(sum(inc)))}\n- Tổng chi: ${fmtVND(BigInt(sum(out)))}`, attachment: fs.createReadStream(imgPath) });
      }

      case "history": {
        if (!bankData.transactions.length) return reply("[ LỊCH SỬ GIAO DỊCH ]\nKhông có giao dịch nào.");
        const { pages, per, total } = await buildHistoryPages(bankData, userData);
        const pageCount = Math.max(1, pages.length);
        const pageNum = Math.min(pageCount, Math.max(1, parseInt(args[1] || "1", 10) || 1));
        const body = `[ LỊCH SỬ GIAO DỊCH ]\n(${total} giao dịch) | Trang ${pageNum}/${pageCount} | Mỗi trang ${per}\n\n${pages[pageNum - 1]}\n\n↩️ Trả lời: n/p số | q để thoát`;
        return reply(body, (err: any, info: any) => {
          if (err) return;
          main.onReply.set(info.messageID, { commandName: "bank", author: senderID, messageID: info.messageID, data: { pages, page: pageNum, pageCount, per, total } });
        });
      }

      case "daily": {
        const last = bankData.lastDaily || 0;
        const since = last ? Math.floor((Date.now() - last) / dayMs) : Math.floor((Date.now() - (bankData.accountCreated || Date.now())) / dayMs);
        if (since < 1) return reply("⚠️ Bạn đã nhận hôm nay, quay lại sau");
        const addDays = since;
        const before = bankData.money;
        const after = compoundDepositTiered(before, addDays);
        const depInterest = after - before;
        bankData.money = after;
        let loanInterest = 0n;
        if (bankData.loan > 0n) {
          const loanAfter = compoundLoanTiered(bankData.loan, addDays);
          loanInterest = loanAfter - bankData.loan;
          bankData.loan = loanAfter;
          bankData.lastLoanTs = Date.now();
        }
        const termCredited = settleMatureTerms(bankData);
        bankData.transactions.push({ type: "interest_deposit_daily", amount: depInterest, timestamp: Date.now() });
        if (loanInterest > 0n) bankData.transactions.push({ type: "interest_loan_daily", amount: loanInterest, timestamp: Date.now() });
        const newStreak = last && Date.now() - last <= 2 * dayMs ? bankData.dailyStreak + 1 : 1;
        bankData.dailyStreak = newStreak;
        const rewardBase = 2000n;
        const reward = rewardBase + BigInt(Math.min(30, newStreak)) * 500n;
        bankData.money += reward;
        bankData.transactions.push({ type: "daily_reward", amount: reward, timestamp: Date.now() });
        bankData.lastDaily = Date.now();
        writeBank(senderID, bankData);
        return reply(`🎁 Daily +${fmtVND(reward)} | 🔁 +${addDays} ngày lãi\n- Lãi gửi cộng: +${fmtVND(depInterest)}\n- Lãi vay cộng: ${loanInterest > 0n ? `-${fmtVND(loanInterest)}` : "0 VNĐ"}\n- Kỳ hạn đáo hạn: ${termCredited > 0n ? `+${fmtVND(termCredited)}` : "0 VNĐ"}\n- Streak: ${newStreak}`);
      }

      case "unlock": {
        if (!Array.isArray(config.OWNER) || !config.OWNER.map(String).includes(senderID)) return reply("⚠️ Bạn không có quyền");
        let id: string | null;
        if (event.type === "message_reply" && event.messageReply?.senderID) id = String(event.messageReply.senderID);
        else if (Object.keys(event.mentions || {}).length > 0) id = String(Object.keys(event.mentions)[0]).replace(/\&mibextid=ZbWKwL/g, "");
        else {
          const raw = args[1];
          if (!raw) id = senderID;
          else id = isValidURL(raw) ? String(await bot.api.getUID(raw)) : /^\d+$/.test(raw) ? String(raw) : null;
        }
        if (!id) return reply("⚠️ ID không hợp lệ");
        const data = readBank(id);
        if (!data) return reply("⚠️ Tài khoản không tồn tại");
        if (!data.isLocked) return reply("⚠️ Tài khoản này chưa bị khóa");
        data.isLocked = false;
        data.lockReason = "";
        writeBank(id, data);
        return reply(`✅ Đã mở khóa tài khoản ${id}`);
      }

      case "stats": {
        const spendingByMonth: Record<string, bigint> = {};
        const incomeByMonth: Record<string, bigint> = {};
        for (const t of bankData.transactions) {
          const d = new Date(t.timestamp);
          const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
          const amt = toBI(t.amount);
          if (["withdraw", "transfer_out", "payment", "interest_loan_daily", "term_open", "fee"].includes(t.type)) {
            spendingByMonth[key] = (spendingByMonth[key] || 0n) + amt;
          } else if (["deposit", "interest", "interest_deposit_daily", "transfer_in", "loan", "daily_reward", "term_mature", "goal_done"].includes(t.type)) {
            incomeByMonth[key] = (incomeByMonth[key] || 0n) + amt;
          }
        }
        const sumBI = (obj: Record<string, bigint>) => Object.values(obj).reduce((a, b) => a + b, 0n);
        const spending = sumBI(spendingByMonth);
        const income = sumBI(incomeByMonth);
        const total = spending + income;
        const W = 600, H = 400, CX = 220, CY = 200, R = 140;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d") as any;
        ctx.fillStyle = "#f7f7f8";
        ctx.fillRect(0, 0, W, H);
        const spendAngle = total === 0n ? 0 : (toFiniteNumber(spending) / Math.max(1, toFiniteNumber(total))) * Math.PI * 2;
        const incomeAngle = total === 0n ? 0 : (toFiniteNumber(income) / Math.max(1, toFiniteNumber(total))) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.arc(CX, CY, R, 0, spendAngle);
        ctx.closePath();
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.arc(CX, CY, R, spendAngle, spendAngle + incomeAngle);
        ctx.closePath();
        ctx.fillStyle = "#22c55e";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(CX, CY, R, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#111827";
        ctx.stroke();
        ctx.fillStyle = "#111827";
        ctx.font = "20px Arial";
        ctx.textAlign = "left";
        ctx.fillText("Thống kê chi tiêu", 370, 60);
        ctx.font = "16px Arial";
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(370, 90, 20, 20);
        ctx.fillStyle = "#111827";
        ctx.fillText(`Chi tiêu: ${fmtVND(spending)}`, 400, 106);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(370, 130, 20, 20);
        ctx.fillStyle = "#111827";
        ctx.fillText(`Thu nhập: ${fmtVND(income)}`, 400, 146);
        const imgPath = join(tempDir, `stats_${senderID}_${Date.now()}.png`);
        fs.writeFileSync(imgPath, canvas.toBuffer("image/png"));
        const spendLines = Object.entries(spendingByMonth).map(([m, v]) => `- ${m}: ${fmtVND(v)}`).join("\n") || "Không có";
        const incomeLines = Object.entries(incomeByMonth).map(([m, v]) => `- ${m}: ${fmtVND(v)}`).join("\n") || "Không có";
        return reply({
          body: `[ THỐNG KÊ CHI TIÊU ]\n\n💸 Tổng chi tiêu: ${fmtVND(spending)}\n💰 Tổng thu nhập: ${fmtVND(income)}\n\n📅 Chi tiêu theo tháng:\n${spendLines}\n\n📅 Thu nhập theo tháng:\n${incomeLines}`,
          attachment: fs.createReadStream(imgPath)
        });
      }

      case "top": {
        const files = fs.readdirSync(baseDir).filter(f => f.endsWith(".json"));
        const users = await Promise.all(files.map(async f => {
          const id = f.replace(".json", "");
          const d = readBank(id);
          const name = (await userData.getName(id)) || "Người dùng";
          return { id, name, money: d ? d.money : 0n };
        }));
        const top = users.sort((a, b) => (b.money > a.money ? 1 : -1)).slice(0, 10);
        const board = top.map((u, i) => `${i + 1}. ${u.name} (${u.id}) - ${fmtVND(u.money)}`).join("\n") || "Chưa có dữ liệu";
        return reply(`[ TOP NGƯỜI DÙNG GIÀU NHẤT ]\n\n${board}`);
      }

      case "toploan": {
        const files = fs.readdirSync(baseDir).filter(f => f.endsWith(".json"));
        const users = await Promise.all(files.map(async f => {
          const id = f.replace(".json", "");
          const d = readBank(id);
          const name = (await userData.getName(id)) || "Người dùng";
          return { id, name, loan: d ? d.loan : 0n };
        }));
        const top = users.filter(u => u.loan > 0n).sort((a, b) => (b.loan > a.loan ? 1 : -1)).slice(0, 10);
        const board = top.map((u, i) => `${i + 1}. ${u.name} (${u.id}) - ${fmtVND(u.loan)}`).join("\n") || "Không có ai nợ";
        return reply(`[ TOP DƯ NỢ CAO NHẤT ]\n\n${board}`);
      }

      case "topstreak": {
        const files = fs.readdirSync(baseDir).filter(f => f.endsWith(".json"));
        const users = await Promise.all(files.map(async f => {
          const id = f.replace(".json", "");
          const d = readBank(id);
          const name = (await userData.getName(id)) || "Người dùng";
          return { id, name, streak: d ? d.dailyStreak : 0 };
        }));
        const top = users.sort((a, b) => b.streak - a.streak).slice(0, 10);
        const board = top.map((u, i) => `${i + 1}. ${u.name} (${u.id}) - 🔥 ${u.streak}`).join("\n") || "Không có dữ liệu";
        return reply(`[ TOP DAILY STREAK ]\n\n${board}`);
      }

      case "ban": {
        if (!Array.isArray(config.OWNER) || !config.OWNER.map(String).includes(senderID)) return reply("⚠️ Bạn không có quyền");
        let id: string | null;
        if (event.type === "message_reply" && event.messageReply?.senderID) id = String(event.messageReply.senderID);
        else if (Object.keys(event.mentions || {}).length > 0) id = String(Object.keys(event.mentions)[0]).replace(/\&mibextid=ZbWKwL/g, "");
        else {
          const raw = args[1];
          id = raw ? (isValidURL(raw) ? String(await bot.api.getUID(raw)) : /^\d+$/.test(raw) ? String(raw) : null) : null;
        }
        if (!id) return reply("⚠️ Nhập ID cần khóa");
        if (id === senderID) return reply("⚠️ Không thể tự khóa mình");
        const data = readBank(id);
        if (!data) return reply("⚠️ Tài khoản không tồn tại");
        if (data.isLocked) return reply("⚠️ Tài khoản đã bị khóa");
        const reason = args.slice(2).join(" ") || "Vi phạm điều khoản";
        data.isLocked = true;
        data.lockReason = reason;
        data.creditScore = Math.max(0, data.creditScore - 50);
        writeBank(id, data);
        return reply(`✅ Đã khóa tài khoản ${id}\n- Lý do: ${reason}\n- Điểm tín dụng: ${data.creditScore} (-50)`);
      }

      case "checkban": {
        if (!Array.isArray(config.OWNER) || !config.OWNER.map(String).includes(senderID)) return reply("⚠️ Bạn không có quyền");
        const files = fs.readdirSync(baseDir).filter(f => f.endsWith(".json"));
        const locked: string[] = [];
        for (const f of files) {
          const id = f.replace(".json", "");
          const d = readBank(id);
          if (d && d.isLocked) {
            const name = (await userData.getName(id)) || "Người dùng";
            locked.push(`${locked.length + 1}. ${name} (${id})\n- Lý do: ${d.lockReason}\n- Điểm tín dụng: ${d.creditScore}`);
          }
        }
        return reply(locked.length ? `[ DANH SÁCH TÀI KHOẢN BỊ KHÓA ]\n\n${locked.join("\n\n")}` : "✅ Không có tài khoản bị khóa");
      }

      default:
        return reply(
          `[ DONIX BANKING ]\n\n` +
          `1. 📝 [-r/register] Đăng ký tài khoản\n` +
          `2. 💳 [check/info] Xem thông tin\n` +
          `3. 💰 [gui/gửi] Gửi tiền (số tiền/all/%)\n` +
          `4. 💵 [rut/rút] Rút tiền (số tiền/all/%)\n` +
          `5. 💸 [vay] Vay tiền (số tiền/all/%)\n` +
          `6. 💱 [trả/trano] Thanh toán khoản vay (số tiền/all)\n` +
          `7. 💌 [pay/transfer/chuyển] Chuyển tiền (có phí)\n` +
          `8. 👥 [split] Chia đều cho người được tag (có phí)\n` +
          `9. 🧾 [request|requests|accept|decline] Yêu cầu, xem, chấp nhận/từ chối\n` +
          `10. 🎯 [goal set|add|take|list|del] Mục tiêu tiết kiệm + thưởng\n` +
          `11. 📦 [term open|list|claim|close] Sổ tiết kiệm kỳ hạn\n` +
          `12. 🗓️ [plan] Lịch trả nợ gợi ý\n` +
          `13. 📉 [trend] Biểu đồ đường theo ngày\n` +
          `14. 📊 [history] Lịch sử giao dịch (phân trang)\n` +
          `15. 🧮 [calc] Giả lập lãi theo ngày\n` +
          `16. 🔓 [unlock] Admin mở khóa\n` +
          `17. 📈 [stats] Thống kê chi tiêu\n` +
          `18. 🏆 [top] Top giàu nhất\n` +
          `19. 🧾 [toploan] Top dư nợ\n` +
          `20. 🔥 [topstreak] Top streak daily\n\n` +
          `💎 Lãi gửi: <1M: 0.10% | ≥1M: 0.20% | ≥10M: 0.25% | ≥100M: 0.30%\n` +
          `📦 Kỳ hạn: 0.35%–0.60%/ngày\n` +
          `💸 Lãi vay: <10M: 0.30% | ≥10M: 0.40% | ≥50M: 0.50%\n` +
          `💵 Phí giao dịch: 0.5% (min 500, max 50,000) áp dụng chuyển tiền/split`
        );
    }
  },
  onReply: async ({ bot, event, Reply, reply, main }: any) => {
    if (String(event.senderID) !== String(Reply.author)) return;
    const text = String(event.body || "").trim().toLowerCase();
    if (!text) return;
    if (text === "q" || text === "quit" || text === "cancel") {
      await bot.unsendMessage(Reply.messageID, event.threadID);
      main.onReply.delete(Reply.messageID);
      return;
    }
    let page = Reply.data.page;
    if (text === "n" || text === "next") page = Math.min(Reply.data.pageCount, page + 1);
    else if (text === "p" || text === "prev") page = Math.max(1, page - 1);
    else if (/^\d+$/.test(text)) page = Math.min(Reply.data.pageCount, Math.max(1, parseInt(text, 10)));
    else return;
    await bot.unsendMessage(Reply.messageID, event.threadID);
    const body = `[ LỊCH SỬ GIAO DỊCH ]\n(${Reply.data.total} giao dịch) | Trang ${page}/${Reply.data.pageCount} | Mỗi trang ${Reply.data.per}\n\n${Reply.data.pages[page - 1]}\n\n↩️ Trả lời: n/p số | q để thoát`;
    return reply(body, (info: any) => {
      main.onReply.delete(Reply.messageID);
      main.onReply.set(info.messageID, { commandName: "bank", author: event.senderID, messageID: info.messageID, data: { ...Reply.data, page } });
    });
  }
};

export default command;
