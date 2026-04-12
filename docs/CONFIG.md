# Cấu hình DonixV4 (`config.json`)

DonixV4 đọc cấu hình tại `src/core/config/config.json` và **tự watch** file để reload khi bạn sửa.

## 1) Cảnh báo bảo mật

Trong cấu hình có thể chứa:
- `cookie`: cookie Messenger/Facebook
- `token`: access token (EAAAAU/EAAD…)
- `fbAccounts`: email/password/2FA

Các giá trị này **tuyệt đối không public** (không paste lên chat công khai, không commit lên GitHub).

---

## 2) Các trường cấu hình phổ biến

### Prefix

- `PREFIX`: tiền tố để gọi lệnh (ví dụ: `"/"` → gõ `/menu`)

Lưu ý: trong codebase có nơi dùng `PREFIX` (hoa) và có nơi type cũ dùng `prefix` (thường). Dự án hiện đang dùng `PREFIX` trong file config mẫu.

### Thông tin bot

- `BOTNAME`: tên bot để hiển thị/nhắc trong một số lệnh
- `DevMode`: bật log thêm và một số hành vi debug

### Quyền hạn

- `OWNER`: ID người sở hữu (string)
- `ADMIN`: danh sách ID admin (array string)
- `adminOnly`: nếu `true` thì chỉ admin/owner dùng được nhiều lệnh

### Chống inbox

- `antiINBOX`: nếu `true` bot có thể hạn chế xử lý tin nhắn inbox cá nhân (tùy handler)

### Box admin nhận log/thông báo

- `BOX_ADMIN`: ID thread/box nhận thông báo (có thể rỗng)
- `adminbox`: map `{ [threadId]: boolean }` để bật/tắt “chỉ admin” theo từng box

### Bật/tắt plugin loader

- `loadSrcips.enable`: bật/tắt việc load commands/events
- `loadSrcips.cmdDis`: danh sách file command muốn disable (so theo tên file, lowercase)
- `loadSrcips.eventDis`: danh sách file event muốn disable

### MQTT tự reconnect

- `mqttAutoReconnect.enable`: bật/tắt cơ chế tự reconnect
- `mqttAutoReconnect.interval`: thời gian (ms) để “kick reconnect” định kỳ
- `mqttAutoReconnect.hangTimeout`: nếu MQTT im quá lâu (ms), bot sẽ chạy health probe để kiểm tra treo
- `mqttAutoReconnect.probeTimeout`: timeout (ms) cho probe QoS1 trước khi coi MQTT bị treo và restart `listenMqtt`

### Scheduler (tác vụ định kỳ)

`scheduler.enabled`: bật scheduler

`scheduler.tasks`: các task có thể bật/tắt riêng, ví dụ:
- `tokenCheck`: check token theo chu kỳ
- `updNick`: cập nhật nickname theo giờ
- `notifyExp`: thông báo hết hạn
- `sendTop`: gửi top chat
- `resetGeminiQuota`: reset quota Gemini
- `autoInteractFeed`: auto tương tác feed (đang tắt mặc định trong config hiện có)

---

## 3) Ví dụ cấu hình “an toàn” (đã che nhạy cảm)

Bạn có thể dùng template này để share nội bộ mà không lộ secrets.

```json
{
  "PREFIX": "/",
  "BOTNAME": "Obito",
  "DevMode": false,
  "userAgent": "Mozilla/5.0 ...",
  "cookie": "c_user=...; xs=...; fr=...; datr=...",
  "OWNER": "502275138",
  "ADMIN": ["100001...", "61587..."],
  "token": {
    "EAAAAU": "EAAAAU...",
    "EAAD6V7": "EAAD6V7...",
    "EAAD": "EAAD..."
  },
  "antiINBOX": true,
  "adminOnly": true,
  "BOX_ADMIN": "",
  "adminbox": {
    "722146370916700": false
  },
  "loadSrcips": {
    "enable": true,
    "cmdDis": [],
    "eventDis": []
  },
  "mqttAutoReconnect": {
    "enable": true,
    "interval": 3600000
  },
  "scheduler": {
    "enabled": true,
    "tasks": {
      "tokenCheck": { "enabled": true, "type": "everyH", "hours": 2 },
      "updNick": { "enabled": true, "type": "at", "time": "00:22" }
    }
  }
}
```

---

## 4) Cookie hết hạn thì sao?

Luồng hiện tại trong `src/core/main.ts`:
- Nếu `cookie` thiếu hoặc rỗng → bot sẽ **thử auto login**
- Nếu login fail và có dấu hiệu cookie expired → bot cũng **thử auto login** rồi restart

Nếu bạn vẫn bị “Not logged in / cookie expired”:
- Đảm bảo `cookie` đang hợp lệ
- Hoặc cấu hình `fbAccounts` để auto login có thể hoạt động

Xem thêm `docs/TROUBLESHOOTING.md`.

