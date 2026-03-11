# DonixV4

Bot Messenger viết bằng **Node.js + TypeScript**, chạy bằng `tsx`, hỗ trợ hệ plugin:
- **Commands**: `src/plugins/cmds/**`
- **Events**: `src/plugins/events/**`

Entry chạy là `src/index.ts` (orchestrator) sẽ spawn `src/core/main.ts` và tự restart theo exit code.

---

## Yêu cầu

- **Node.js**: khuyến nghị **v20+**
- **npm**: đi kèm Node
- Windows: nên dùng **Git Bash** hoặc terminal có hỗ trợ ANSI màu

---

## Cài đặt

```bash
npm install
```

---

## Cấu hình (quan trọng)

File cấu hình hiện nằm ở:

- `src/core/config/config.json`

Trong file này có các trường **nhạy cảm** như `cookie`, `token`, `fbAccounts.email/password/twofactor`.

- **Không chia sẻ công khai** các giá trị này.
- Nếu bạn fork/đẩy code lên GitHub, hãy **thay bằng cấu hình mẫu** và giữ cấu hình thật ở máy bạn.

Xem hướng dẫn chi tiết và ví dụ cấu hình an toàn tại `docs/CONFIG.md`.

---

## Chạy bot

### Dev (watch file)

```bash
npm run start:dev
```

### Normal

```bash
npm start
```

### Prod (tối ưu GC/RAM)

```bash
npm run start:prod
```

---

## Bot hoạt động như thế nào (tóm tắt)

- `src/index.ts`: bắt `uncaughtException/unhandledRejection`, spawn tiến trình chạy bot chính và tự restart.
- `src/core/main.ts`:
  - load + watch `config.json` (qua `src/core/configManager.ts`)
  - init cookie global
  - init database (SQLite trong `storage/sqlite`)
  - login Messenger
  - load plugin (commands/events)
  - `listenMqtt()` để nhận event realtime và dispatch vào handlers

---

## Cấu trúc thư mục (rút gọn)

- `src/core/`: lõi bot, config manager, plugin loader, scheduler, database, handlers
- `src/plugins/cmds/`: lệnh theo category (Game/Admin/Tiện_ích/…)
- `src/plugins/events/`: sự kiện (log subscribe/unsubscribe/…)
- `src/services/`: các service tích hợp (tiktok/youtube/instagram/…)
- `src/API/`: layer API (login, mqtt, request formatters…)
- `storage/`: dữ liệu runtime (sqlite, media, game data, cookies…)

---

## Viết command/plugin mới

Xem `docs/PLUGINS.md` để biết:
- Format module command/event
- Các trường phổ biến (`name`, `desc`, `guide`, `role`, `cd`, `prefix`)
- Cách dùng `ctx.send`, `ctx.reply`, `ctx.event`, `ctx.args`, `storagePath(...)`

---

## Troubleshooting

Xem `docs/TROUBLESHOOTING.md` cho các lỗi hay gặp:
- Cookie hết hạn / “Not logged in”
- MQTT disconnect / timeout
- Không load được plugin / trùng tên lệnh
- Lỗi native deps như `canvas`, `sharp`, `sqlite3`

---

## Ghi chú bảo mật

- **Không commit** cookies/token/password.
- Các file runtime trong `storage/` phần lớn nên được ignore (dự án đã ignore nhiều path trong `.gitignore`).

