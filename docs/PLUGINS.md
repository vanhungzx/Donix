# Plugins (Commands & Events)

DonixV4 load plugin ở runtime bằng `src/core/pluginLoader/index.ts`.

- **Commands**: đặt tại `src/plugins/cmds/<Category>/*.ts`
- **Events**: đặt tại `src/plugins/events/*.ts`

Khi bot khởi động, plugin loader sẽ:
- scan file `.ts`
- `import()` từng module
- đăng ký vào `main.cmds` (commands) và `main.events` (events)
- gọi hook `onLoad` (nếu có)

## 1) Cấu trúc command module

Một command là một object `Command` (type ở `src/types/index.d.ts`), ví dụ tối giản:

```ts
import type { Command, CommandOnCallContext } from "@types";

const hello: Command = {
  name: "hello",
  alias: ["hi"],
  desc: "Chào một câu",
  guide: "{pn}: chào",
  role: 0,
  cd: 3,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext) => {
    await ctx.reply("Xin chào!");
  }
};

export default hello;
```

### Các field hay dùng

- `name`: tên lệnh (bắt buộc, **không trùng**)
- `alias`: tên gọi phụ
- `desc`: mô tả ngắn
- `guide`: hướng dẫn (thường dùng `{pn}` = prefix+name)
- `role`: quyền (tuỳ dự án: 0 user, 1 mod, 2 admin…)
- `cd`: cooldown (giây)
- `prefix`: có cần prefix hay không
- `category`: nếu không set, loader sẽ tự lấy theo tên folder (ví dụ `Game`, `Admin`…)

### Context (`ctx`) trong `onCall`

`ctx` thường có:
- `ctx.event`: event message (threadID, senderID, mentions, attachments…)
- `ctx.args`: mảng tham số sau lệnh
- `ctx.commandName`: tên lệnh đã gọi
- `ctx.send(...)`, `ctx.reply(...)`: gửi tin nhắn
- `ctx.unsend(...)`, `ctx.edit(...)`, `ctx.react(...)`, `ctx.contact(...)`

Ví dụ thực tế (lệnh “ôm”) nằm ở `src/plugins/cmds/Game/om.ts`:
- lấy `event.mentions`
- tải GIF về `storage/` nếu chưa có
- reply kèm attachment

---

## 2) Command có `onReply` / `onReact` / `onChat` / `onEvent`

Bạn có thể dùng các hook này khi muốn:
- **`onReply`**: bắt reply theo `messageID` mà command đã gửi ra trước đó
- **`onReact`**: bắt reaction vào message liên quan
- **`onChat`**: chạy cho mọi tin nhắn chat (thường để auto-feature)
- **`onEvent`**: chạy cho event nâng cao (log, presence, …)

Lưu ý: loader hiện normalize `onChat` và `onEvent` để chỉ nhận **function** (không nhận boolean).

---

## 3) Cấu trúc event module

Event module có dạng (xem `src/plugins/events/botEvent.ts`):

```ts
import type { BotEvent, EventContext } from "@types";

const botEvent: BotEvent = {
  name: "botEvent",
  desc: "Log một số sự kiện",
  type: ["log:unsubscribe", "log:subscribe"],

  onCall: async (ctx: EventContext) => {
    // ctx.event chứa logMessageType, logMessageData...
  }
};

export default botEvent;
```

`type` có thể là string hoặc string[] (ví dụ: `"log:subscribe"`).

---

## 4) Bật/tắt plugin

Trong `config.json`:

- `loadSrcips.enable`: tắt/bật load plugin
- `loadSrcips.cmdDis`: disable theo tên file (lowercase)
- `loadSrcips.eventDis`: disable theo tên file (lowercase)

---

## 5) Tips khi viết plugin

- Đặt `name` **không dấu** nếu bạn muốn gọi lệnh dễ gõ; còn nếu thích tên hiển thị có dấu, có thể dùng `alias`.
- Tránh block event loop: các tác vụ nặng nên async, có timeout, và catch lỗi.
- Dữ liệu runtime nên lưu dưới `storage/` (dùng helper `storagePath(...)` trong core).

