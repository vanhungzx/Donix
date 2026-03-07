/**
 * Best–effort decoder for binary /ls_resp text payloads.
 *
 * Định dạng thật của ls_resp là nhị phân custom, rất khó reverse đầy đủ.
 * Hàm này tập trung trích ra:
 *  - Các URL (http/https)
 *  - Các đoạn text UTF-8 đọc được (Tiếng Việt, tiếng Anh, v.v.)
 *  - Một số câu thông báo thường dùng của group invite
 *
 * Kết quả trả về là JSON đơn giản, dễ log / inspect.
 */

export interface DecodedLsResp {
  raw: string;
  urls: string[];
  texts: string[];
}

export interface GroupInviteJson {
  /** Tiêu đề / tên nhóm chat (nếu bắt được) */
  threadTitle?: string;
  /** Mô tả / giải thích khi tham gia nhóm */
  joinExplainerText?: string;
  /** Text tóm tắt số thành viên, ví dụ "Bạn đã kết nối với 3 người" */
  memberSummaryText?: string;
  /** Số thành viên (nếu parse được từ summary) */
  memberCount?: number;
  /** Ảnh đại diện / cover chính (ưu tiên URL Facebook CDN) */
  mainImageUrl?: string;
  /** Ảnh fallback / media_fallback nếu có */
  fallbackImageUrl?: string;
  /** Tất cả URL tìm được trong payload */
  allUrls: string[];
  /** Câu thông báo lỗi nếu link hết hạn / không còn hoạt động */
  errorText?: string;
  /** True nếu phát hiện thông báo link hết hạn / không còn hoạt động */
  isExpired?: boolean;
  /** Các đoạn text thô để debug thêm */
  rawTexts: string[];
}

/**
 * Tách các đoạn text "in được" (printable) khỏi chuỗi nhị phân.
 * - Ngắt theo ký tự NUL (0x00) và các control char < 0x20 (trừ \n, \r, \t)
 * - Chỉ giữ những đoạn có độ dài tối thiểu (mặc định 4)
 */
const extractPrintableSegments = (input: string, minLen = 4): string[] => {
  const segments: string[] = [];
  let current = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    const code = ch.charCodeAt(0);

    const isAllowedControl = ch === "\n" || ch === "\r" || ch === "\t";
    const isPrintable = code >= 0x20 && code !== 0x7f;

    if (isPrintable || isAllowedControl) {
      current += ch;
    } else {
      if (current.length >= minLen) {
        segments.push(current.trim());
      }
      current = "";
    }
  }

  if (current.length >= minLen) {
    segments.push(current.trim());
  }

  return segments;
};

/**
 * Decode nhị phân ls_resp (được Node trả về dạng string) thành JSON đơn giản.
 */
export const decodeLsRespBinaryToJson = (raw: string): DecodedLsResp => {
  // Bản thân `raw` đã là chuỗi từ Buffer.toString('binary') / tương tự.
  const urls: string[] = [];
  const texts: string[] = [];

  // 1) Tách tất cả URL
  const urlRegex = /(https?:\/\/[^\s\x00"'<>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(raw)) !== null) {
    const u = m[1];
    if (u && !urls.includes(u)) {
      urls.push(u);
    }
  }

  // 2) Tách các đoạn text "in được"
  const printableSegments = extractPrintableSegments(raw, 4);

  // Lọc bớt các đoạn quá kỹ thuật (toàn ký tự điều khiển / ký hiệu)
  for (const seg of printableSegments) {
    const hasLetterOrDigit = /[A-Za-zÀ-ỹ0-9]/.test(seg);
    if (!hasLetterOrDigit) continue;

    // Ưu tiên các đoạn có nghĩa: câu, SQL, message, v.v.
    texts.push(seg);
  }

  return {
    raw,
    urls,
    texts
  };
};

/**
 * Chuyển payload nhị phân của group invite thành JSON "rõ ràng" hơn.
 * Dựa trên mẫu bạn log:
 *  - Có SQL SELECT / INSERT vào bảng group_invitations_pending
 *  - Có join explainer text tiếng Việt
 *  - Có URL ảnh nhóm, media_fallback, v.v.
 */
export const decodeGroupInviteFromLsResp = (raw: string): GroupInviteJson => {
  const base = decodeLsRespBinaryToJson(raw);
  const texts = base.texts;
  const urls = base.urls;

  const result: GroupInviteJson = {
    allUrls: urls,
    rawTexts: texts
  };

  // 1) Lỗi / trạng thái hết hạn
  const errorText = texts.find(t =>
    /Liên kết\b.+(không còn hoạt động|hết hạn)/i.test(t)
  );
  if (errorText) {
    result.errorText = errorText;
    result.isExpired = true;
  }

  // 2) Join explainer text (đoạn dài giải thích khi tham gia nhóm)
  const explainer = texts.find(t =>
    /nếu bạn tham gia nhóm chat này|Nếu bạn tham gia nhóm chat này/i.test(t)
  );
  if (explainer) {
    result.joinExplainerText = explainer;
  }

  // 3) Tóm tắt số thành viên, ví dụ "Bạn đã kết nối với 3 người"
  const memberSummary = texts.find(t =>
    /Bạn đã kết nối với \d+ người/i.test(t)
  );
  if (memberSummary) {
    result.memberSummaryText = memberSummary;
    const m = memberSummary.match(/(\d+)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) {
        result.memberCount = n;
      }
    }
  }

  // 4) Tên nhóm chat (thường là một đoạn text ngắn trước/ sau các câu trên).
  // Vì format nhị phân khó đoán vị trí chính xác, ta heuristic:
  // - Lấy đoạn text nằm cạnh câu "Bạn đã kết nối với ..." hoặc chứa "ChatBot", "Group", v.v.
  if (!result.threadTitle) {
    const titleCandidate = texts.find(t =>
      /ChatBot|Nhóm|Group|Room|Chat\s*VN/i.test(t)
    );
    if (titleCandidate) {
      result.threadTitle = titleCandidate;
    }
  }

  // 5) Chọn main image URL:
  // Ưu tiên URL có "scontent." (Facebook CDN ảnh) nếu có,
  // nếu không thì lấy cái đầu tiên trong danh sách.
  const mainImg =
    urls.find(u => /scontent\./i.test(u)) ||
    urls.find(u => /static\.xx\.fbcdn\.net/i.test(u)) ||
    urls[0];
  if (mainImg) {
    result.mainImageUrl = mainImg;
  }

  // 6) fallback image (media_fallback/)
  const fallback = urls.find(u => /media_fallback/i.test(u));
  if (fallback) {
    result.fallbackImageUrl = fallback;
  }

  return result;
};
