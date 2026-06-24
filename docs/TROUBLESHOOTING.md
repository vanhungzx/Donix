# Troubleshooting

## 1) Lỗi login: “Not logged in”, “cookie expired”, “Account logged out”

Triệu chứng:
- Bot báo lỗi login hoặc đang listen MQTT thì bị “logged out”.

Cách xử lý:
- Cập nhật lại `cookie` trong `src/core/config/config.json`.
- Nếu bạn dùng auto-login: đảm bảo `fbAccounts` có `email/password/twofactor` đúng và `disabled: false`.

Trong `src/core/main.ts` bot có cơ chế:
- thiếu cookie → thử auto login
- cookie có dấu hiệu hết hạn → thử auto login rồi restart

---

## 2) MQTT disconnect / timeout / reconnect liên tục

Triệu chứng:
- log kiểu `ETIMEDOUT`, `ECONNRESET`, `socket hang up`

Cách xử lý:
- Kiểm tra mạng (VPN/proxy/ISP).
- Thử đổi `userAgent` trong config.
- Nếu server yếu, giảm tải lệnh/media nặng.
- Kiểm tra `mqttAutoReconnect` đang bật và `interval` hợp lý.

---

## 3) Plugin không load / lỗi “Duplicate command name”

Triệu chứng:
- Bot log “Failed to load commands …”
- hoặc “Duplicate command name … skipping”

Cách xử lý:
- Đảm bảo mỗi command có `name` duy nhất (không trùng).
- Kiểm tra file command có `onCall` (hoặc handler tương đương). Loader sẽ báo lỗi nếu thiếu.
- Nếu đang disable plugin trong config: kiểm tra `loadSrcips.enable`, `cmdDis`, `eventDis`.

---

## 4) Lỗi native dependency (canvas/sharp/sqlite3)

Các package như `canvas`, `sharp`, `sqlite3` đôi khi cần build native.

Cách xử lý nhanh trên Windows:
- Dùng Node v20 LTS
- `npm install` lại từ đầu (xóa `node_modules` + `package-lock.json` nếu cần)
- Nếu vẫn lỗi: xem log build cụ thể rồi cài thêm toolchain (Visual Studio Build Tools)

---

## 5) RAM tăng cao / treo lâu

Trong `src/core/main.ts` có auto-cleanup theo RSS để giảm leak/cached handlers.

Nếu vẫn nặng:
- Tắt bớt plugin nặng bằng `loadSrcips.cmdDis`
- Giảm feature auto (scheduler, autoInteractFeed…)
- Hạn chế lệnh media/AI chạy đồng thời

