# FreeFire API (CommonJS SDK)

Thư viện **FreeFire API** giúp bạn:

- Đăng nhập Garena Free Fire bằng UID/PASSWORD (guest/account).
- Lấy thông tin người chơi (profile, items, pet, v.v.).
- Lấy thống kê BR/CS (career/normal/ranked).
- Render **ảnh thống kê đẹp** (PNG) bằng `node-canvas` cho BR & CS.

Thư viện được viết theo chuẩn **CommonJS** (dùng `require`).

---

## Cài đặt

```bash
npm install
```

Trong `package.json` đã khai báo các dependency chính:

- `axios`
- `protobufjs`
- `canvas` (cần build tools phù hợp với hệ điều hành)

Khuyến nghị dùng **Node.js ≥ 18**.

---

## Cấu hình

### 1. `config/settings.yaml`

File này chứa:

- Khóa AES (`AE_MAIN_KEY`, `AE_MAIN_IV`) dùng để mã hóa/giải mã payload protobuf.
- Header mặc định gửi lên server (User-Agent, X-Unity-Version, v.v.).
- URL Garena OAuth & MajorLogin.
- Đường dẫn các endpoint Free Fire:
  - `URL_PATH_SEARCH`
  - `URL_PATH_PERSONAL_SHOW`
  - `URL_PATH_PLAYER_STATS`
  - `URL_PATH_PLAYER_CS_STATS`

> Nếu thiếu/bỏ trống giá trị, code sẽ ném lỗi: _Missing required setting in config/settings.yaml_.

### 2. `config/credentials.yaml`

Chứa **UID** và **PASSWORD** mặc định dùng cho auto-login:

```yaml
# Default credentials for auto login.
UID: "..."
PASSWORD: "..."
```

- Các giá trị hiện tại chỉ là ví dụ; **hãy thay bằng tài khoản/credential của bạn**.
- Không commit credential thật lên repo public.

Nếu bạn không truyền tham số cho `login(uid, password)`, SDK sẽ tự đọc UID/PASSWORD từ file này.

### 3. `config/accountConfiguration.json`

Map sẵn tài khoản cho từng region (IND, VN, TH, ...):

- Mỗi key là mã server (IND, VN, BR, ...).
- Giá trị gồm `uid` và `password` (đã mã hóa).

Bạn có thể dùng file này để tự build tool chuyển server hay vòng lặp test nhiều vùng.

---

## Sử dụng nhanh

### Import SDK

```js
const FreeFireAPI = require("freefire-api"); // tương đương ./index.js
```

Hoặc require trực tiếp service tiện dụng:

```js
const freefireService = require("freefire-api/service");
const {
  searchAccount,
  getPlayerStats,
  getPlayerPersonalShow,
  getPlayerItems,
  getStatsCanvas,
} = freefireService;
```

> Trong repo local: thay `"freefire-api"` bằng đường dẫn tương đối (`./index.js`, `./service.js`, ...).

### Ví dụ: tìm kiếm tài khoản theo tên

```js
const { searchAccount } = require("./service.js");

async function main() {
  const result = await searchAccount({ keyword: "nickname" });
  console.log(result);
}

main().catch(console.error);
```

### Ví dụ: lấy thống kê BR/CS

```js
const { getPlayerStats } = require("./service.js");

async function main() {
  const stats = await getPlayerStats({
    server: "IND",     // mặc định: 'IND'
    uid: "3301269321",
    gamemode: "br",    // 'br' | 'cs'
    matchmode: "CAREER" // 'CAREER' | 'NORMAL' | 'RANKED'
  });

  console.log(stats);
}

main().catch(console.error);
```

### Ví dụ: render ảnh stats (PNG buffer)

```js
const { getStatsCanvas } = require("./service.js");
const fs = require("fs");

async function main() {
  const result = await getStatsCanvas({
    server: "VN",
    uid: "3301269321",
    gamemode: "br",        // 'br' hoặc 'cs'
    matchmode: "CAREER",   // canvas hiện chỉ support 'CAREER'
  });

  if (result.success) {
    fs.writeFileSync("stats.png", result.buffer);
  }
}

main().catch(console.error);
```

---

## API chính

### `class FreeFireAPI` (`lib/api.js`)

- `async login(uid?, password?)`
  - Nếu không truyền param → dùng credential trong `config/credentials.yaml`.
  - Thực hiện:
    1. Gọi Garena OAuth (`_getGarenaToken`).
    2. Gọi MajorLogin (`_majorLogin`).
  - Lưu token/session lại trong `this.session`.

- `async searchAccount(keyword)`
- `async getPlayerProfile(uid)`
- `async getPlayerItems(uid)`
- `async getPlayerStats(uid, mode = 'br', matchType = 'career')`

### Service wrapper (`service.js`)

Các hàm tiện lợi:

- `searchAccount({ keyword })`
- `getPlayerStats({ server, uid, gamemode, matchmode })`
- `getPlayerPersonalShow({ server, uid })`
- `getPlayerItems({ server, uid })`
- `getStatsCanvas({ server, uid, gamemode, matchmode })`

Mỗi hàm sẽ:

- Tự gọi `login()` nếu chưa có session (qua `_checkSession()`).
- Validate input cơ bản (rỗng, format sai, value không hợp lệ,...).
- Ném lỗi kèm message dễ debug nếu có vấn đề.

### Canvas helpers (`freefireStatsCanvas.js`)

- `renderFreeFireStatsCanvas(data)`
- `mapPlayerStatsToCanvasData(apiData, uid, server, matchmode?)`
- `renderFreeFireCSStatsCanvas(data)`
- `mapCSStatsToCanvasData(apiData, uid, server, matchmode?)`

Chi tiết tham số xem thêm trong `docs/USAGE.md`.

---

## Thư mục dữ liệu

- `data/items.json`: danh sách item trong game (id, name, type, rarity, ...).
- `lib/utils.js`:
  - Load `items.json` vào memory.
  - Map raw item id sang object giàu thông tin (tên, loại, rarity, icon, ...).
  - Chuẩn hoá cấu trúc `processPlayerItems(playerData)`.

---

## Tài liệu chi tiết

Xem thêm trong:

- `docs/USAGE.md` – hướng dẫn chi tiết về:
  - Cấu trúc response.
  - Định dạng data cho canvas.
  - Ví dụ full flow từ login → lấy stats → render ảnh.

---

## Góp ý / Issue

Nếu bạn phát hiện bug hoặc muốn thêm tính năng mới, có thể:

- Mở issue trên repo (nếu dùng Git).
- Hoặc sửa trực tiếp code trong `lib/` và `service.js` theo nhu cầu.

