import crypto from 'crypto';
import fs from 'fs';
import moment from 'moment-timezone';
import { RENT_JSON_PATH, RENT_KEYS_PATH, STORAGE_RENT } from '../../../core/storagePath';
import { remDays, nicknameFor } from '../../../core/handleEvents/task/utils';

const RENT_PATH = RENT_JSON_PATH();
const KEY_PATH = RENT_KEYS_PATH();
const RENT_DIR = STORAGE_RENT();

interface RentRecord {
  threadID: string;
  userID: string;
  startDate: string;
  endDate: string;
  key: string | null;
  banked?: boolean;
}

type KeyType = 'activate' | 'renew';

interface RentKey {
  key: string;
  createdDate: string;
  expiryDate: string;
  duration: string;
  type: KeyType;
  used: boolean;
  groupId: string;
}

type ReplyType = 'bank' | 'unbank' | 'clear' | 'list' | 'listkey' | 'check';

interface ReplyMeta {
  type: ReplyType;
  commandName: string;
  messageID: string;
  author: string;
  threadID: string;
  createdAt?: number; // Timestamp để cleanup
  rentList?: RentRecord[];
  keyList?: RentKey[];
  page?: number;
  totalPages?: number;
  expiredRents?: RentRecord[];
  expiredInGroups?: RentRecord[];
  validNotInGroups?: RentRecord[];
  expiredNotInGroups?: RentRecord[];
  unbankedGroups?: RentRecord[];
  bankedGroups?: RentRecord[];
}

const saveData = (data: unknown, p: string): void => {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
};

const loadData = (p: string): any[] => {
  try {
    if (fs.existsSync(p)) {
      const fileData = fs.readFileSync(p, 'utf-8') || '[]';
      return JSON.parse(fileData);
    }
  } catch {
    // ignore
  }
  return [];
};

const invalidDate = (date: string | number): boolean => {
  const parts = String(date).split('/').map(Number);
  if (parts.length !== 3) return true;
  const [day, month, year] = parts;
  if (day === undefined || month === undefined || year === undefined) return true;
  const parsedDate = new Date(year, month - 1, day);
  return (
    isNaN(parsedDate.getTime()) ||
    parsedDate.getDate() !== day ||
    parsedDate.getMonth() + 1 !== month ||
    parsedDate.getFullYear() !== year
  );
};

const calculateRemainingDays = (endDate: string): number => {
  const parts = endDate.split('/').map(Number);
  if (parts.length !== 3) return 0;
  const [day, month, year] = parts;
  if (day === undefined || month === undefined || year === undefined) return 0;
  const end = new Date(year, month - 1, day);
  const today = new Date();
  const diffTime = end.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const onLoad = (): void => {
  try {
    if (!fs.existsSync(RENT_DIR)) fs.mkdirSync(RENT_DIR, { recursive: true });
    if (!fs.existsSync(RENT_PATH)) fs.writeFileSync(RENT_PATH, '[]', 'utf-8');
    if (!fs.existsSync(KEY_PATH)) fs.writeFileSync(KEY_PATH, '[]', 'utf-8');
  } catch {
    // ignore
  }
};

const onCall = async ({
  reply,
  client, // ✅ bot -> client
  event,
  args,
  userData,
  threadData,
  config,
  main,
  commandName
}: any): Promise<any> => {
  if (args.length < 1) {
    return reply('Bạn cần chỉ định case. Gõ "{pn} help rent" để xem hướng dẫn.');
  }

  const today = moment().tz('Asia/Ho_Chi_Minh');
  const sub = String(args[0]).toLowerCase();

  const getBotId = async (): Promise<string> => {
    try {
      const id = String((client as any)?.id ?? '');
      if (id) return id;
      const id2 = await (client as any)?.getCurrentUserID?.();
      return String(id2 ?? '');
    } catch {
      return '';
    }
  };

  const notRentedNickname = async (threadID: string): Promise<string> => {
    const pre0 = String(config?.PREFIX || '/');
    const botname = String(config?.BOTNAME || 'Obito');
    try {
      const inf = await threadData.get(String(threadID)).catch(() => null);
      const pre = String(inf?.data?.PREFIX || pre0);
      return `[ ${pre} ] • ${botname} || Chưa thuê`;
    } catch {
      return `[ ${pre0} ] • ${botname} || Chưa thuê`;
    }
  };

  switch (sub) {
    case 'add': {
      if (args.length < 2) {
        return reply(
          'Vui lòng cung cấp thời gian: số ngày, 1t (tháng), hoặc DD/MM/YYYY.\nNâng cao: add <threadID> <userID> <DD/MM/YYYY>'
        );
      }
      let threadID = String(event.threadID);
      let userID = String(event.senderID);
      if (event.type === 'message_reply') userID = String(event.messageReply.senderID);
      else if (event.mentions && Object.keys(event.mentions).length > 0) {
        userID = String(Object.keys(event.mentions)[0]);
      }

      const timeStart = today.format('DD/MM/YYYY');
      let timeEnd: string;

      if (
        args.length === 4 &&
        /^\d+$/.test(args[1]) &&
        /^\d+$/.test(args[2]) &&
        /\d{1,2}\/\d{1,2}\/\d{4}/.test(args[3])
      ) {
        threadID = String(args[1]);
        userID = String(args[2]);
        timeEnd = args[3];
      } else if (args.length === 3 && /^\d+$/.test(args[1]) && /\d{1,2}\/\d{1,2}\/\d{4}/.test(args[2])) {
        userID = String(args[1]);
        timeEnd = args[2];
      } else {
        const token = String(args[1]).toLowerCase();
        if (/^\d+$/.test(token)) {
          const days = parseInt(token, 10);
          if (days <= 0) return reply('⚠️ Số ngày phải > 0');
          timeEnd = today.clone().add(days, 'days').format('DD/MM/YYYY');
        } else if (/^\d+t$/i.test(token)) {
          const months = parseInt(token.replace(/t$/i, ''), 10);
          if (months <= 0) return reply('⚠️ Số tháng phải > 0');
          timeEnd = today.clone().add(months, 'months').format('DD/MM/YYYY');
        } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/i.test(token)) {
          timeEnd = token;
        } else {
          return reply('⚠️ Thời gian không hợp lệ! Dùng số ngày / "1t" / "DD/MM/YYYY".');
        }
      }

      if (isNaN(Number(userID)) || isNaN(Number(threadID))) return reply('⚠️ ID không hợp lệ.');
      if (invalidDate(timeStart) || invalidDate(timeEnd)) return reply('⚠️ Thời gian không hợp lệ.');

      const rentList = loadData(RENT_PATH) as RentRecord[];
      if (rentList.find((r) => r.threadID === threadID)) {
        return reply('⚠️ Nhóm đã có dữ liệu thuê bot.');
      }

      const rentData: RentRecord = {
        threadID,
        userID,
        startDate: timeStart,
        endDate: timeEnd,
        key: null
      };
      rentList.push(rentData);
      saveData(rentList, RENT_PATH);

      // Cập nhật biệt danh với số ngày còn lại
      try {
        const uid = await getBotId();
        if (uid) {
          const pre0 = String(config?.PREFIX || '/');
          const botname = String(config?.BOTNAME || 'Obito');
          const inf = await threadData.get(String(threadID)).catch(() => null);
          const pre = String(inf?.data?.PREFIX || pre0);
          const d = remDays(timeEnd);
          const nn = nicknameFor(pre, botname, d);
          await client.changeNickname(nn, String(threadID), String(uid));
        }
      } catch {
        // ignore
      }

      return reply(
        `✅ Thêm thành công!\n⏱️ ${timeStart} → ${timeEnd}\n🆔 Nhóm: ${threadID}\n👤 Người thuê: ${userID}`
      );
    }

    case 'del': {
      const targetThread = args[1] ? String(args[1]) : String(event.threadID);
      const rentList = loadData(RENT_PATH) as RentRecord[];
      const idx = rentList.findIndex((r) => r.threadID === targetThread);
      if (idx === -1) return reply('⚠️ Không tìm thấy dữ liệu thuê của nhóm này.');

      const deleted = rentList[idx];
      if (!deleted) return reply('⚠️ Không tìm thấy dữ liệu thuê của nhóm này.');
      const threadName =
        (await threadData.get(deleted.threadID))?.threadInfo?.threadName || deleted.threadID;
      const userName = await userData.getName(deleted.userID).catch(() => 'Không xác định');

      rentList.splice(idx, 1);
      saveData(rentList, RENT_PATH);

      // Reset nickname về trạng thái "chưa thuê"
      try {
        const uid = await getBotId();
        if (uid) {
          const nn = await notRentedNickname(targetThread);
          await client.changeNickname(nn, String(targetThread), String(uid));
        }
      } catch {
        // ignore
      }

      return reply(
        `✅ Đã xóa dữ liệu thuê:\n- Nhóm: ${threadName}\n- Người thuê: ${userName}\n- Thời gian: ${deleted.startDate} → ${deleted.endDate}`
      );
    }

    case 'stats': {
      const rentList = loadData(RENT_PATH) as RentRecord[];
      if (!rentList.length) return reply('📭 Không có dữ liệu thuê bot');

      let dangThue = 0,
        hetHan = 0;
      const sapHetHan: { threadID: string; ngayConLai: number }[] = [];

      for (const r of rentList) {
        const d = calculateRemainingDays(r.endDate);
        if (d >= 0) {
          dangThue++;
          if (d <= 7) sapHetHan.push({ threadID: r.threadID, ngayConLai: d });
        } else hetHan++;
      }

      let msg = '📊 Thống kê thuê bot\n\n';
      msg += `👥 Tổng nhóm: ${rentList.length}\n`;
      msg += `✅ Đang thuê: ${dangThue}\n`;
      msg += `❌ Hết hạn: ${hetHan}\n`;
      msg += `⚠️ Sắp hết hạn: ${sapHetHan.length}\n\n`;

      if (sapHetHan.length) {
        msg += '📝 Nhóm sắp hết hạn:\n';
        for (const nhom of sapHetHan) {
          const name =
            (await threadData.get(nhom.threadID))?.threadInfo?.threadName || nhom.threadID;
          msg += `- ${name}: còn ${nhom.ngayConLai} ngày\n`;
        }
      }
      msg += `\n💡 Dùng "rent list" / "rent check".`;
      return reply(msg);
    }

    case 'price':
    case 'banggia': {
      const msg =
        '📌 BẢNG GIÁ THUÊ BOT\n\n' +
        '【 GÓI CƠ BẢN – THUÊ BOT 】\n' +
        '• 1 tháng: 25.000đ\n' +
        '• 3 tháng: 75.000đ (phổ biến)\n' +
        '• 6 tháng: 150.000đ\n' +
        '• 12 tháng: 300.000đ (tiết kiệm 25%)\n\n' +
        'Quyền lợi: Tự động trả lời 24/7, hỗ trợ kỹ thuật miễn phí, cập nhật tính năng mới.\n\n' +
        '【 GÓI CAO CẤP – BOT + ADMIN 】\n' +
        '• 1 tháng: 33.000đ\n' +
        '• 3 tháng: 98.000đ (phổ biến)\n' +
        '• 6 tháng: 195.000đ\n' +
        '• 12 tháng: 390.000đ (tiết kiệm 25%)\n\n' +
        'Quyền lợi thêm: Tất cả tính năng Bot, Admin quản lý chuyên nghiệp, tuỳ chỉnh cao cấp, ưu tiên hỗ trợ VIP.\n\n' +
        '💳 THANH TOÁN\n' +
        '- Ngân hàng: MB Bank\n' +
        '- STK: 3107112006\n' +
        '- Chủ TK: PHAM MINH DONG\n\n' +
        '📞 HỖ TRỢ & BẢO HÀNH\n' +
        '- Facebook: fb.com/mdong.dev\n' +
        '- Tư vấn 24/7 – Có bảo hành, hỗ trợ đổi nhóm khi cần.\n';

      return reply(msg);
    }

    case 'listkey': {
      const keyList = loadData(KEY_PATH) as RentKey[];
      if (!keyList.length) return reply('⚠️ Hiện tại chưa có key nào.');

      const content = keyList
        .map((k, i) => {
          const status = k.used ? `Đã dùng cho nhóm: ${k.groupId || 'N/A'}` : 'Chưa sử dụng';
          const typ = k.type === 'renew' ? 'Gia hạn' : 'Kích hoạt';
          return `🔑 Key ${i + 1}: ${k.key}\n- Ngày tạo: ${k.createdDate}\n- Hết hạn: ${k.expiryDate}\n- Thời hạn: ${k.duration}\n- Loại: ${typ}\n- Trạng thái: ${status}`;
        })
        .join('\n\n');

      return reply(`Danh sách key:\n\n${content}`, (err: any, info: any) => {
        if (err) return;
        const meta: ReplyMeta = {
          type: 'listkey',
          commandName,
          messageID: info.messageID,
          threadID: event.threadID,
          author: event.senderID,
          createdAt: Date.now(),
          keyList
        };
        main.onReply.set(info.messageID, meta);
      });
    }

    case 'giahan': {
      if (args.length < 2) return reply('Vui lòng nhập thời gian gia hạn (ngày | 1t | DD/MM/YYYY).');

      const threadID = String(event.threadID);
      const rentList = loadData(RENT_PATH) as RentRecord[];
      const rec = rentList.find((r) => r.threadID === threadID);
      if (!rec) return reply('⚠️ Nhóm này chưa có dữ liệu thuê.');

      const curEnd = moment(rec.endDate, 'DD/MM/YYYY').tz('Asia/Ho_Chi_Minh');
      if (!curEnd.isValid()) return reply(`⚠️ Ngày hết hạn hiện tại không hợp lệ: ${rec.endDate}`);

      const token = String(args[1]).toLowerCase();
      let newEnd: moment.Moment;
      let label: string;

      if (/^\d+$/.test(token)) {
        const days = parseInt(token, 10);
        if (days <= 0) return reply('⚠️ Số ngày không hợp lệ.');
        const base = curEnd.isBefore(today, 'day') ? today.clone() : curEnd.clone();
        if (curEnd.isBefore(today, 'day')) rec.startDate = today.format('DD/MM/YYYY');
        newEnd = base.clone().add(days, 'days');
        label = `${days.toLocaleString()} ngày`;
      } else if (/^\d+t$/i.test(token)) {
        const months = parseInt(token.replace(/t$/i, ''), 10);
        if (months <= 0) return reply('⚠️ Số tháng không hợp lệ.');
        const base = curEnd.isBefore(today, 'day') ? today.clone() : curEnd.clone();
        if (curEnd.isBefore(today, 'day')) rec.startDate = today.format('DD/MM/YYYY');
        newEnd = base.clone().add(months, 'months');
        label = `${months.toLocaleString()} tháng`;
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(token)) {
        const target = moment(token, 'DD/MM/YYYY').tz('Asia/Ho_Chi_Minh');
        if (!target.isValid() || !target.isAfter(curEnd)) {
          return reply('⚠️ Ngày đích không hợp lệ hoặc không lớn hơn ngày hiện tại.');
        }
        newEnd = target;
        label = `đến ${token}`;
      } else {
        return reply('⚠️ Thời gian không hợp lệ. Dùng số ngày / "1t" / "DD/MM/YYYY".');
      }

      rec.endDate = newEnd.format('DD/MM/YYYY');
      saveData(rentList, RENT_PATH);
      return reply(`🎉 Gia hạn thành công!\n📅 ${rec.startDate} → ${rec.endDate}\n📝 Đã gia hạn thêm ${label}.`);
    }

    case 'key': {
      if (args.length < 2) return reply('Dùng: {pn} rent key <30|1t> [số lượng] [giahan]');

      const genKey = (t: KeyType): string =>
        `donix${t === 'renew' ? '_giahan' : ''}_${crypto.randomBytes(3).toString('hex')}`;

      const token = String(args[1]).toLowerCase();
      let unit: 'days' | 'months' = 'days';
      let num = parseInt(token, 10);

      if (token.endsWith('t')) {
        unit = 'months';
        num = parseInt(token.replace('t', ''), 10);
      }
      if (!num || num <= 0) return reply('⚠️ Thời hạn không hợp lệ.');

      let qty = 1;
      let type: KeyType = 'activate';

      for (let i = 2; i < args.length; i++) {
        const tok = String(args[i]).toLowerCase();
        if (/^\d+$/.test(tok)) qty = parseInt(tok, 10);
        if (tok === 'giahan' || tok === 'renew') type = 'renew';
      }
      if (!qty || qty <= 0) return reply('⚠️ Số lượng không hợp lệ.');

      const now = moment.tz('Asia/Ho_Chi_Minh');
      const store = loadData(KEY_PATH) as RentKey[];
      const out: RentKey[] = [];

      for (let i = 0; i < qty; i++) {
        const key = genKey(type);
        out.push({
          key,
          createdDate: now.format('DD/MM/YYYY'),
          expiryDate: now.clone().add(num, unit).format('DD/MM/YYYY'),
          duration: `${num} ${unit}`,
          type,
          used: false,
          groupId: ''
        });
      }

      store.push(...out);
      saveData(store, KEY_PATH);

      const title = type === 'renew' ? 'gia hạn' : 'kích hoạt';
      const text = out
        .map((k, i) => `Key ${i + 1}: ${k.key}\n- Ngày tạo: ${k.createdDate}\n- Hết hạn: ${k.expiryDate}\n- Loại: ${title}`)
        .join('\n\n');

      return reply(`✅ Tạo ${qty} key ${title} (${num} ${unit}):\n\n${text}`);
    }

    case 'info': {
      const rentList = loadData(RENT_PATH) as RentRecord[];
      const rec = rentList.find((item) => item.threadID === String(event.threadID));
      if (!rec) return reply('⚠️ Nhóm chưa thuê bot.');

      const userName = await userData.getName(rec.userID).catch(() => 'Không xác định');
      const tinfo =
        (await threadData.get(rec.threadID).catch(() => null)) ||
        ({ threadInfo: { threadName: 'Không xác định' } } as any);
      const threadName = tinfo.threadInfo.threadName;
      const d = calculateRemainingDays(rec.endDate);
      const status = d >= 0 ? `còn ${d.toLocaleString()} ngày` : `đã hết hạn ${Math.abs(d).toLocaleString()} ngày`;

      return reply(
        `[ Thông Tin Thuê Bot ]\n\n📌 Nhóm: ${threadName}\n👤 Người thuê: ${userName}\n📅 ${rec.startDate} → ${rec.endDate}\n🔑 Key: ${
          rec.key || 'không có'
        }\n🔰 Trạng thái: ${status}`
      );
    }

    case 'list': {
      try {
        const rentList = loadData(RENT_PATH) as RentRecord[];
        if (!rentList.length) return reply('📭 Không có dữ liệu thuê bot');

        const PER_PAGE = 10;
        const page = Math.max(1, parseInt(args[1] || '1', 10));
        const totalPages = Math.max(1, Math.ceil(rentList.length / PER_PAGE));
        if (page > totalPages) return reply(`⚠️ Số trang không hợp lệ (1-${totalPages}).`);

        const start = (page - 1) * PER_PAGE;
        const pageItems = rentList.slice(start, start + PER_PAGE);

        const lines = await Promise.all(
          pageItems.map(async (rent, i) => {
            const name = await userData.getName(rent.userID).catch(() => 'N/A');
            const thread = (await threadData.get(rent.threadID))?.threadInfo?.threadName || 'N/A';
            const days = calculateRemainingDays(rent.endDate);
            const status = days >= 0 ? `✅ Còn ${days} ngày` : `❌ Hết hạn ${Math.abs(days)} ngày`;
            const idx = start + i + 1;
            return `│ ╭─ ${idx}. ${thread}\n│ ├─ 👤 ${name}\n│ ├─ ⏳ ${status}\n│ ╰─ 📅 ${rent.startDate} → ${rent.endDate}\n│`;
          })
        );

        const message =
          `╭─「 DANH SÁCH THUÊ BOT 」─╮\n` +
          `│ 📄 Trang ${page}/${totalPages}\n\n` +
          `${lines.join('\n')}\n` +
          `├─「 HƯỚNG DẪN 」─┤\n` +
          `│ ➜ del + STT\n` +
          `│ ➜ giahan + STT + time\n` +
          `│ ➜ out + STT\n` +
          `│ ➜ page + số\n` +
          `╰──────────────╯`;

        return reply(message, (err: any, info: any) => {
          if (err) return;
          const meta: ReplyMeta = {
            type: 'list',
            commandName,
            messageID: info.messageID,
            author: event.senderID,
            threadID: event.threadID,
            createdAt: Date.now(),
            rentList,
            page,
            totalPages
          };
          main.onReply.set(info.messageID, meta);
        });
      } catch {
        return reply('❌ Lỗi khi lấy danh sách thuê bot.');
      }
    }

    case 'transfer': {
      const mentions = Object.keys(event.mentions || {});
      if (!mentions.length) return reply('⚠️ Vui lòng tag người nhận quyền thuê.');
      const newOwnerID = String(mentions[0]);

      const rentList = loadData(RENT_PATH) as RentRecord[];
      const threadID = String(event.threadID);
      const rec = rentList.find((r) => r.threadID === threadID);
      if (!rec) return reply('⚠️ Nhóm này chưa có dữ liệu thuê.');

      const oldName = await userData.getName(rec.userID).catch(() => rec.userID);
      const newName = await userData.getName(newOwnerID).catch(() => newOwnerID);
      rec.userID = newOwnerID;
      saveData(rentList, RENT_PATH);

      return reply(`✅ Đã chuyển quyền thuê bot:\n- Từ: ${oldName}\n- Sang: ${newName}`);
    }

    case 'check': {
      try {
        const rentList = loadData(RENT_PATH) as RentRecord[];
        const expiredRents = rentList.filter((r) => calculateRemainingDays(r.endDate) < 0);
        if (!expiredRents.length) return reply('✅ Không có nhóm nào hết hạn.');

        const lines = await Promise.all(
          expiredRents.map(async (r, i) => {
            const tinfo =
              (await threadData.get(r.threadID).catch(() => null)) ||
              ({ threadInfo: { threadName: 'Không xác định' } } as any);
            const name = tinfo?.threadInfo?.threadName || 'Không xác định';
            const d = Math.abs(calculateRemainingDays(r.endDate));
            return `${i + 1}. ${name}\n   ID: ${r.threadID}\n   Hết hạn: ${d} ngày trước`;
          })
        );

        return reply(
          `📝 Nhóm hết hạn:\n${lines.join('\n')}\n\nReply: "out N" để out 1 nhóm, "out all" để out tất cả`,
          (err: any, info: any) => {
            if (err) return;
            const meta: ReplyMeta = {
              type: 'check',
              commandName,
              messageID: info.messageID,
              author: event.senderID,
              threadID: event.threadID,
              createdAt: Date.now(),
              expiredRents
            };
            main.onReply.set(info.messageID, meta);
          }
        );
      } catch {
        return reply('❌ Lỗi khi kiểm tra danh sách hết hạn.');
      }
    }

    case 'clear': {
      try {
        const groups = (await client.getThreadList(150, null, ['INBOX']))
          .filter((g: any) => g.isSubscribed && g.isGroup)
          .map((g: any) => String(g.threadID));

        const rentList = loadData(RENT_PATH) as RentRecord[];
        const expiredInGroups: RentRecord[] = [];
        const validNotInGroups: RentRecord[] = [];
        const expiredNotInGroups: RentRecord[] = [];
        const validInGroups: RentRecord[] = [];

        for (const r of rentList) {
          const remain = calculateRemainingDays(r.endDate);
          const inGroup = groups.includes(r.threadID);
          if (remain < 0) (inGroup ? expiredInGroups : expiredNotInGroups).push(r);
          else (inGroup ? validInGroups : validNotInGroups).push(r);
        }

        let report = '📊 Phân tích dữ liệu thuê bot:\n\n';
        const mk = async (arr: RentRecord[], title: string) => {
          if (!arr.length) return '';
          let s = `${title}\n`;
          for (const r of arr) {
            const tinfo =
              (await threadData.get(r.threadID).catch(() => null)) ||
              ({ threadInfo: { threadName: 'Unknown' } } as any);
            const name = tinfo?.threadInfo?.threadName || 'Unknown';
            const v = calculateRemainingDays(r.endDate);
            s += `- ${name} (${r.threadID}) - ${v >= 0 ? `Còn ${v} ngày` : `Hết hạn ${Math.abs(v)} ngày`}\n`;
          }
          return s + '\n';
        };

        report += await mk(validInGroups, '✅ Nhóm còn hạn và client đang ở trong:');
        report += await mk(expiredInGroups, '❌ Nhóm hết hạn client đang ở trong:');
        report += await mk(validNotInGroups, '⚠️ Nhóm còn hạn nhưng client không ở trong:');
        report += await mk(expiredNotInGroups, '🗑️ Nhóm hết hạn và client không ở trong:');

        if (validNotInGroups.length || expiredNotInGroups.length) {
          const updated = rentList.filter(
            (r) =>
              !expiredNotInGroups.some((x) => x.threadID === r.threadID) &&
              !validNotInGroups.some((x) => x.threadID === r.threadID)
          );
          saveData(updated, RENT_PATH);
          report += '✅ Đã xóa dữ liệu của các nhóm không còn client.\n';
        }

        report += '\n📝 Reply lựa chọn:\n';
        if (expiredInGroups.length) report += '• "out" — out các nhóm hết hạn (client đang trong nhóm)\n';
        report += '• "clean" — out nhóm hết hạn + xóa dữ liệu nhóm không có client\n';
        report += '• "remove" — xóa tất cả dữ liệu không hợp lệ\n';

        return reply(report, (err: any, info: any) => {
          if (err) return;
          const meta: ReplyMeta = {
            type: 'clear',
            commandName,
            messageID: info.messageID,
            author: event.senderID,
            threadID: event.threadID,
            createdAt: Date.now(),
            expiredInGroups,
            validNotInGroups,
            expiredNotInGroups
          };
          main.onReply.set(info.messageID, meta);
        });
      } catch {
        return reply('❌ Lỗi khi phân tích dữ liệu.');
      }
    }

    case 'bank': {
      const rentList = loadData(RENT_PATH) as RentRecord[];
      if (!rentList.length) return reply('📭 Không có dữ liệu thuê bot');

      const unbanked = rentList.filter((r) => !r.banked);
      if (!unbanked.length) return reply('✅ Tất cả nhóm đã bank.');

      let msg = '📝 Danh sách nhóm chưa bank:\n\n';
      for (let i = 0; i < unbanked.length; i++) {
        const r = unbanked[i];
        if (!r) continue;
        const threadName = (await threadData.get(r.threadID))?.threadInfo?.threadName || r.threadID;
        const userName = await userData.getName(r.userID).catch(() => r.userID);
        const d = calculateRemainingDays(r.endDate);
        const st = d >= 0 ? `còn ${d} ngày` : `hết hạn ${Math.abs(d)} ngày`;
        msg += `${i + 1}. ${threadName}\n👤 ${userName}\n⏳ ${st}\n📅 ${r.startDate} → ${r.endDate}\n\n`;
      }
      msg += '💡 Reply số (có thể nhiều số, cách nhau bởi khoảng trắng) để đánh dấu đã bank.';

      return reply(msg, (err: any, info: any) => {
        if (err) return console.error(err);
        const meta: ReplyMeta = {
          type: 'bank',
          commandName,
          messageID: info.messageID,
          author: event.senderID,
          threadID: event.threadID,
          createdAt: Date.now(),
          unbankedGroups: unbanked,
          rentList
        };
        main.onReply.set(info.messageID, meta);
      });
    }

    case 'unbank': {
      const rentList = loadData(RENT_PATH) as RentRecord[];
      if (!rentList.length) return reply('📭 Không có dữ liệu thuê bot');

      const banked = rentList.filter((r) => r.banked);
      if (!banked.length) return reply('❌ Chưa có nhóm nào bank.');

      let msg = '📝 Danh sách nhóm đã bank:\n\n';
      for (let i = 0; i < banked.length; i++) {
        const r = banked[i];
        if (!r) continue;
        const threadName = (await threadData.get(r.threadID))?.threadInfo?.threadName || r.threadID;
        const userName = await userData.getName(r.userID).catch(() => r.userID);
        const d = calculateRemainingDays(r.endDate);
        const st = d >= 0 ? `còn ${d} ngày` : `hết hạn ${Math.abs(d)} ngày`;
        msg += `${i + 1}. ${threadName}\n👤 ${userName}\n⏳ ${st}\n📅 ${r.startDate} → ${r.endDate}\n\n`;
      }
      msg += '💡 Reply số (có thể nhiều số) để bỏ đánh dấu bank.';

      return reply(msg, (err: any, info: any) => {
        if (err) return console.error(err);
        const meta: ReplyMeta = {
          type: 'unbank',
          commandName,
          messageID: info.messageID,
          author: event.senderID,
          threadID: event.threadID,
          createdAt: Date.now(),
          bankedGroups: banked,
          rentList
        };
        main.onReply.set(info.messageID, meta);
      });
    }

    default:
      return reply('⚠️ Lệnh không hợp lệ. Gõ "{pn} help rent" để xem hướng dẫn.');
  }
};

const onReply = async ({
  client, // ✅ bot -> client
  Reply,
  main,
  event,
  threadData,
  userData,
  config
}: any): Promise<any> => {
  const body = String(event.body || '').trim();
  if (Reply.author && Reply.author !== event.senderID) {
    return;
  }

  const getBotId = async (): Promise<string> => {
    try {
      const id = String((client as any)?.id ?? '');
      if (id) return id;
      const id2 = await (client as any)?.getCurrentUserID?.();
      return String(id2 ?? '');
    } catch {
      return '';
    }
  };

  const notRentedNickname = async (threadID: string): Promise<string> => {
    const pre0 = String(config?.PREFIX || '/');
    const botname = String(config?.BOTNAME || 'Obito');
    try {
      const inf = await threadData.get(String(threadID)).catch(() => null);
      const pre = String(inf?.data?.PREFIX || pre0);
      return `[ ${pre} ] • ${botname} || Chưa thuê`;
    } catch {
      return `[ ${pre0} ] • ${botname} || Chưa thuê`;
    }
  };

  switch (Reply.type as ReplyType) {
    case 'bank': {
      const indices = body
        .split(/\s+/)
        .map((n) => parseInt(n, 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= Reply.unbankedGroups.length);
      if (!indices.length)
        return client.sendMessage('⚠️ Vui lòng nhập số hợp lệ.', Reply.threadID, Reply.messageID);

      const rentList = loadData(RENT_PATH) as RentRecord[];
      let updated = 0;
      for (const i of indices) {
        const g = Reply.unbankedGroups[i - 1];
        const rec = rentList.find((r) => r.threadID === g.threadID);
        if (rec && !rec.banked) {
          rec.banked = true;
          updated++;
        }
      }
      saveData(rentList, RENT_PATH);
      return client.sendMessage(`✅ Đã đánh dấu bank cho ${updated} nhóm.`, Reply.threadID, Reply.messageID);
    }

    case 'unbank': {
      const indices = body
        .split(/\s+/)
        .map((n) => parseInt(n, 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= Reply.bankedGroups.length);
      if (!indices.length)
        return client.sendMessage('⚠️ Vui lòng nhập số hợp lệ.', Reply.threadID, Reply.messageID);

      const rentList = loadData(RENT_PATH) as RentRecord[];
      let updated = 0;
      for (const i of indices) {
        const g = Reply.bankedGroups[i - 1];
        const rec = rentList.find((r) => r.threadID === g.threadID);
        if (rec && rec.banked) {
          rec.banked = false;
          updated++;
        }
      }
      saveData(rentList, RENT_PATH);
      return client.sendMessage(`✅ Đã bỏ đánh dấu bank cho ${updated} nhóm.`, Reply.threadID, Reply.messageID);
    }

    case 'clear': {
      const cmd = body.toLowerCase();
      const { expiredInGroups, validNotInGroups, expiredNotInGroups } = Reply;

      if (cmd === 'out') {
        let ok = 0,
          fail = 0;
        for (const r of expiredInGroups) {
          try {
            await client.removeUserFromGroup(String(client.getCurrentUserID()), r.threadID);
            ok++;
          } catch {
            fail++;
          }
        }
        return client.sendMessage(`✅ Out nhóm hết hạn: ${ok} thành công, ${fail} thất bại.`, Reply.threadID, Reply.messageID);
      }

      if (cmd === 'remove') {
        const rentList = loadData(RENT_PATH) as RentRecord[];
        const updated = rentList.filter(
          (r) =>
            !expiredNotInGroups.some((x: RentRecord) => x.threadID === r.threadID) &&
            !validNotInGroups.some((x: RentRecord) => x.threadID === r.threadID)
        );
        const removedCount = rentList.length - updated.length;
        saveData(updated, RENT_PATH);
        return client.sendMessage(`✅ Đã xóa ${removedCount} nhóm khỏi dữ liệu không hợp lệ.`, Reply.threadID, Reply.messageID);
      }

      if (cmd === 'clean') {
        let ok = 0,
          fail = 0;
        for (const r of expiredInGroups) {
          try {
            await client.removeUserFromGroup(String(client.getCurrentUserID()), r.threadID);
            ok++;
          } catch {
            fail++;
          }
        }
        const rentList = loadData(RENT_PATH) as RentRecord[];
        const updated = rentList.filter(
          (r) =>
            !expiredNotInGroups.some((x: RentRecord) => x.threadID === r.threadID) &&
            !validNotInGroups.some((x: RentRecord) => x.threadID === r.threadID)
        );
        const removedCount = rentList.length - updated.length;
        saveData(updated, RENT_PATH);
        return client.sendMessage(
          `✅ Dọn dẹp xong:\n• Out nhóm hết hạn: ${ok} (fail: ${fail})\n• Xóa ${removedCount} nhóm khỏi dữ liệu`,
          Reply.threadID,
          Reply.messageID
        );
      }

      return client.sendMessage('⚠️ Lựa chọn không hợp lệ. Hãy dùng: out / clean / remove', Reply.threadID, Reply.messageID);
    }

    case 'list': {
      if (/^page\s+\d+$/i.test(body)) {
        const parts = body.split(/\s+/);
        const page = parts[1] ? parseInt(parts[1], 10) : 1;
        if (!page || page < 1 || page > Reply.totalPages) {
          return client.sendMessage(`⚠️ Số trang không hợp lệ (1-${Reply.totalPages}).`, Reply.threadID, Reply.messageID);
        }
        if (page === Reply.page) {
          return client.sendMessage(`⚠️ Bạn đang ở trang ${page}.`, Reply.threadID, Reply.messageID);
        }

        const PER_PAGE = 10;
        const start = (page - 1) * PER_PAGE;
        const pageItems = Reply.rentList.slice(start, start + PER_PAGE);

        const rows = await Promise.all(
          pageItems.map(async (rent: RentRecord, i: number) => {
            const name = await userData.getName(rent.userID).catch(() => 'N/A');
            const thread = (await threadData.get(rent.threadID))?.threadInfo?.threadName || 'N/A';
            const days = calculateRemainingDays(rent.endDate);
            const status = days >= 0 ? `✅ Còn ${days} ngày` : `❌ Hết hạn ${Math.abs(days)} ngày`;
            const idx = start + i + 1;
            return `│ ╭─ ${idx}. ${thread}\n│ ├─ 👤 ${name}\n│ ├─ ⏳ ${status}\n│ ╰─ 📅 ${rent.startDate} → ${rent.endDate}\n│`;
          })
        );

        const message =
          `╭─「 DANH SÁCH THUÊ BOT 」─╮\n` +
          `│ 📄 Trang ${page}/${Reply.totalPages}\n\n` +
          `${rows.join('\n')}\n` +
          `├─「 HƯỚNG DẪN 」─┤\n` +
          `│ ➜ del + STT\n` +
          `│ ➜ giahan + STT + time\n` +
          `│ ➜ out + STT\n` +
          `│ ➜ page + số\n` +
          `╰──────────────╯`;

        return client.sendMessage(
          message,
          Reply.threadID,
          (err: any, info: any) => {
            if (err) return;
            main.onReply.set(info.messageID, {
              ...Reply,
              page,
              messageID: info.messageID,
              createdAt: Date.now()
            });
          },
          Reply.messageID
        );
      }

      if (/^del\s+(\d+(\s+\d+)*)$/i.test(body)) {
        const indices = body
          .replace(/^del\s+/i, '')
          .trim()
          .split(/\s+/)
          .map(Number);
        const invalid = indices.filter((i: number) => isNaN(i) || i < 1 || i > Reply.rentList.length);
        if (invalid.length)
          return client.sendMessage(`⚠️ STT không hợp lệ: ${invalid.join(', ')}`, Reply.threadID, Reply.messageID);

        const toDelete: RentRecord[] = indices.map((i: number) => Reply.rentList[i - 1]);
        const updatedRent = Reply.rentList.filter((_: RentRecord, idx: number) => !indices.includes(idx + 1));

        const keyList = loadData(KEY_PATH) as RentKey[];
        const updatedKeys = keyList.filter((k) => !toDelete.some((g) => g.threadID === k.groupId));

        saveData(updatedRent, RENT_PATH);
        saveData(updatedKeys, KEY_PATH);

        // Reset nickname các nhóm vừa xóa thuê về "chưa thuê"
        try {
          const uid = await getBotId();
          if (uid) {
            for (const r of toDelete) {
              try {
                const nn = await notRentedNickname(r.threadID);
                await client.changeNickname(nn, String(r.threadID), String(uid));
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }

        const names = await Promise.all(
          toDelete.map(async (r) => {
            const tinfo =
              (await threadData.get(r.threadID).catch(() => null)) ||
              ({ threadInfo: { threadName: 'Unknown' } } as any);
            return tinfo?.threadInfo?.threadName || 'Unknown';
          })
        );

        return client.sendMessage(`✅ Đã xóa:\n${names.map((n: string) => `- ${n}`).join('\n')}`, Reply.threadID, Reply.messageID);
      }

      if (/^giahan\s+(all|\d+)\s+((\d+t|\d+|\d{2}\/\d{2}\/\d{4}))$/i.test(body)) {
        const m = body.match(/^giahan\s+(all|\d+)\s+((\d+t|\d+|\d{2}\/\d{2}\/\d{4}))$/i);
        if (!m || !m[1] || !m[2]) {
          return client.sendMessage('⚠️ Cú pháp không hợp lệ.', Reply.threadID, Reply.messageID);
        }
        const target = m[1];
        const timeInput = m[2];

        let daysToAdd: number | null = null;
        let label = '';

        if (/^\d+$/.test(timeInput)) {
          const d = parseInt(timeInput, 10);
          if (!d || d <= 0) return client.sendMessage('⚠️ Số ngày không hợp lệ.', Reply.threadID, Reply.messageID);
          daysToAdd = d;
          label = `${d.toLocaleString()} ngày`;
        } else if (/^\d+t$/i.test(timeInput)) {
          const mo = parseInt(timeInput.replace(/t$/i, ''), 10);
          if (!mo || mo <= 0) return client.sendMessage('⚠️ Số tháng không hợp lệ.', Reply.threadID, Reply.messageID);
          daysToAdd = mo * 30;
          label = `${mo.toLocaleString()} tháng`;
        } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(timeInput)) {
          const targetDate = moment(timeInput, 'DD/MM/YYYY').tz('Asia/Ho_Chi_Minh');
          if (!targetDate.isValid()) return client.sendMessage('⚠️ Ngày không hợp lệ.', Reply.threadID, Reply.messageID);
          daysToAdd = targetDate.diff(moment().tz('Asia/Ho_Chi_Minh'), 'days');
          label = `đến ${timeInput}`;
        } else {
          return client.sendMessage('⚠️ Thời gian không hợp lệ.', Reply.threadID, Reply.messageID);
        }

        const doExtend = async (rent: RentRecord) => {
          const now = moment().tz('Asia/Ho_Chi_Minh');
          const curEnd = moment(rent.endDate, 'DD/MM/YYYY').tz('Asia/Ho_Chi_Minh');
          if (!curEnd.isValid()) return;
          let base = curEnd.clone();
          if (now.isAfter(curEnd)) {
            rent.startDate = now.format('DD/MM/YYYY');
            base = now.clone();
          }
          rent.endDate = base.add(daysToAdd!, 'days').format('DD/MM/YYYY');
        };

        if (target && target.toLowerCase() === 'all') {
          for (const rent of Reply.rentList) await doExtend(rent);
          saveData(Reply.rentList, RENT_PATH);
          for (const rent of Reply.rentList) {
            try {
              await client.sendMessage(
                `🎉 Nhóm của bạn đã được gia hạn!\n📅 Hết hạn: ${rent.endDate}\n📝 Gia hạn thêm: ${label}`,
                rent.threadID
              );
            } catch {
              // ignore
            }
          }
          return client.sendMessage(`✅ Đã gia hạn cho tất cả nhóm (${label}).`, Reply.threadID, Reply.messageID);
        }

        const stt = parseInt(target, 10);
        if (!stt || stt < 1 || stt > Reply.rentList.length) {
          return client.sendMessage('⚠️ Số thứ tự không hợp lệ.', Reply.threadID, Reply.messageID);
        }
        const rent = Reply.rentList[stt - 1];
        await doExtend(rent);
        saveData(Reply.rentList, RENT_PATH);

        const tinfo =
          (await threadData.get(rent.threadID).catch(() => null)) ||
          ({ threadInfo: { threadName: 'Không xác định' } } as any);
        const name = tinfo?.threadInfo?.threadName;

        try {
          await client.sendMessage(
            `🎉 Nhóm của bạn đã được gia hạn!\n📅 Hết hạn: ${rent.endDate}\n📝 Gia hạn thêm: ${label}`,
            rent.threadID
          );
        } catch {
          // ignore
        }

        return client.sendMessage(`✅ Đã gia hạn cho "${name}" → ${rent.endDate} (${label}).`, Reply.threadID, Reply.messageID);
      }

      if (/^out(?:\s+\d+)+$/i.test(body)) {
        const indices = [...body.matchAll(/\d+/g)]
          .map((m) => parseInt(m[0], 10))
          .filter((n) => n >= 1 && n <= Reply.rentList.length);
        if (!indices.length) return client.sendMessage('⚠️ Không có STT hợp lệ.', Reply.threadID, Reply.messageID);

        for (const i of indices) {
          const r = Reply.rentList[i - 1];
          try {
            await client.removeUserFromGroup(String(client.getCurrentUserID()), r.threadID);
          } catch {
            // ignore
          }
        }
        return client.sendMessage(`⚠️ Đã out nhóm: ${indices.join(', ')}`, Reply.threadID, Reply.messageID);
      }

      if (/^\d+$/.test(body)) {
        const i = parseInt(body, 10);
        if (i < 1 || i > Reply.rentList.length) {
          return client.sendMessage('⚠️ STT không hợp lệ.', Reply.threadID, Reply.messageID);
        }
        const rent = Reply.rentList[i - 1];
        const userName = await userData.getName(rent.userID).catch(() => 'Không xác định');
        const tinfo =
          (await threadData.get(rent.threadID).catch(() => null)) ||
          ({ threadInfo: { threadName: 'Không xác định' } } as any);
        const threadName = tinfo.threadInfo.threadName;
        const d = calculateRemainingDays(rent.endDate);
        const status = d >= 0 ? `còn ${d.toLocaleString()} ngày` : `đã hết hạn ${Math.abs(d).toLocaleString()} ngày`;
        return client.sendMessage(
          `[ Thông Tin Thuê Bot ]\n\n📌 Nhóm: ${threadName}\n👤 Người thuê: ${userName}\n📅 ${rent.startDate} → ${rent.endDate}\n🔑 Key: ${
            rent.key || 'không có'
          }\n🔰 Trạng thái: ${status}`,
          Reply.threadID,
          Reply.messageID
        );
      }

      return client.sendMessage('⚠️ Cú pháp không hợp lệ trong chế độ danh sách.', Reply.threadID, Reply.messageID);
    }

    case 'listkey': {
      const indices = body
        .split(/\s+/)
        .map((n) => parseInt(n, 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= Reply.keyList.length);
      if (!indices.length) return client.sendMessage('⚠️ STT không hợp lệ.', Reply.threadID, Reply.messageID);

      const updated = Reply.keyList.filter((_: RentKey, idx: number) => !indices.includes(idx + 1));
      saveData(updated, KEY_PATH);

      const removed = indices
        .map((i) => Reply.keyList[i - 1])
        .map((k: RentKey) => `🔑 ${k.key}`)
        .join('\n');
      return client.sendMessage(`✅ Đã xóa key:\n${removed}`, Reply.threadID, Reply.messageID);
    }

    case 'check': {
      const txt = body.toLowerCase();
      if (txt === 'out all') {
        let ok = 0,
          fail = 0;
        for (const r of Reply.expiredRents) {
          try {
            await client.removeUserFromGroup(String(client.getCurrentUserID()), r.threadID);
            ok++;
          } catch {
            fail++;
          }
        }
        const rentList = loadData(RENT_PATH) as RentRecord[];
        const updated = rentList.filter((r) => !Reply.expiredRents.some((x: RentRecord) => x.threadID === r.threadID));
        saveData(updated, RENT_PATH);

        return client.sendMessage(`✅ Đã out: ${ok} nhóm (thất bại: ${fail}).`, Reply.threadID, Reply.messageID);
      }

      const m = body.match(/^out\s+(\d+)$/i);
      if (m && m[1]) {
        const idx = parseInt(m[1], 10) - 1;
        if (idx < 0 || idx >= Reply.expiredRents.length) {
          return client.sendMessage('⚠️ STT không hợp lệ.', Reply.threadID, Reply.messageID);
        }
        const pick = Reply.expiredRents[idx];
        try {
          await client.removeUserFromGroup(String(client.getCurrentUserID()), pick.threadID);
          const rentList = loadData(RENT_PATH) as RentRecord[];
          saveData(
            rentList.filter((r) => r.threadID !== pick.threadID),
            RENT_PATH
          );
          return client.sendMessage('✅ Đã out nhóm.', Reply.threadID, Reply.messageID);
        } catch {
          return client.sendMessage('❌ Không thể out nhóm.', Reply.threadID, Reply.messageID);
        }
      }

      return client.sendMessage('⚠️ Dùng: "out N" hoặc "out all".', Reply.threadID, Reply.messageID);
    }

    default:
      return client.sendMessage('❎ Loại phản hồi không hợp lệ.', Reply.threadID || event.threadID, Reply.messageID);
  }
};

const rentCommand = {
  name: 'rent',
  alias: ['thuebot'],
  role: 3,
  desc: 'Quản trị thuê bot (Owner)',
  guide: `   {pn} rent [add/list/giahan/key/info/listkey/del/stats/price/check/clear/bank/unbank/transfer]

  • {pn} rent add <ngày|tháng-t|DD/MM/YYYY>
    VD: {pn} rent add 30
        {pn} rent add 1t
        {pn} rent add 25/12/2025
    (Nâng cao) {pn} rent add <threadID> <userID> <DD/MM/YYYY>

  • {pn} rent list [page]
  • {pn} rent giahan <ngày|tháng-t|DD/MM/YYYY>
  • {pn} rent key <30|1t> [số lượng] [giahan]
  • {pn} rent listkey
  • {pn} rent info
  • {pn} rent del [threadID]
  • {pn} rent stats
  • {pn} rent price (banggia) - Xem bảng giá thuê bot
  • {pn} rent check
  • {pn} rent clear
  • {pn} rent bank / unbank
  • {pn} rent transfer @user
`,
  cd: 0,
  prefix: true,
  onLoad,
  onCall,
  onReply
};

export default rentCommand;
