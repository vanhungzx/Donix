"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnLoadContext,
  CommandOnReplyContext,
} from '@types';
import axios from "axios";
import { createCanvas, loadImage } from "canvas";
import fs from "fs-extra";
import path from "path";

const dirpath = path.join(process.cwd(), "src/storage/game/domin/");

const texthelp =
  "Hướng dẫn:\n" +
  "1. Bảng chơi được chia thành 70 ô nhỏ, các ô không gần mìn sẽ được đào sẵn.\n" +
  "2. Nếu đào trúng ô có mìn, trò chơi kết thúc và người chơi thua. Nếu đào ô không có mìn, ô đó sẽ hiển thị số lượng ô có mìn xung quanh nó.\n" +
  "3. Dựa vào các con số này, người chơi phải suy luận vị trí của các ô có mìn và đánh dấu chúng.\n" +
  "4. Người chơi sẽ chiến thắng khi đào hết các ô không có mìn hoặc đánh dấu đúng các ô có mìn.\n" +
  "5. Tương tác với trò chơi bằng cú pháp: <hành động> <tọa độ>\n" +
  "Vd: 1 e5 f3 (đào 2 ô có tọa độ E5, F3 lên).";

interface Cell {
  opened: boolean;
  isMine: boolean;
  markked: boolean;
  adjacentMines: number;
}

interface GameMap extends Array<Array<Cell>> {
  0: Array<Cell & { complete?: number; flag?: number; mode?: number }>;
  [index: number]: Array<Cell | (Cell & { complete?: number; flag?: number; mode?: number })>;
}

async function draw(map: GameMap, id: string): Promise<string> {
  const canvas = createCanvas(1200, 1000);
  const ctx = canvas.getContext("2d") as any;

  const avatarPath = path.join(dirpath, `avt${id}.png`);
  if (!fs.existsSync(avatarPath)) {
    await loadAvt(id);
  }

  const avatar = await loadImage(avatarPath);
  ctx.drawImage(avatar, 520, 10, 160, 160);

  const [background, texture1, texture2, texture3, texture4, co] =
    await Promise.all([
      loadImage(
        "https://raw.githubusercontent.com/khoado472005/minesweeper/main/board.png"
      ),
      loadImage(
        "https://raw.githubusercontent.com/khoado472005/minesweeper/main/texture1.png"
      ),
      loadImage(
        "https://raw.githubusercontent.com/khoado472005/minesweeper/main/texture2.png"
      ),
      loadImage(
        "https://raw.githubusercontent.com/khoado472005/minesweeper/main/texture3.png"
      ),
      loadImage(
        "https://raw.githubusercontent.com/khoado472005/minesweeper/main/texture4.png"
      ),
      loadImage(
        "https://raw.githubusercontent.com/khoado472005/minesweeper/main/co.png"
      ),
    ]);

  ctx.drawImage(background, 0, 0, 1200, 1000);

  for (let i = 0; i < 10; i++) {
    const row = map[i];
    if (!row) continue;
    for (let j = 0; j < 7; j++) {
      const o = row[j];
      if (!o) continue;

      if (o.opened) {
        if (
          (i % 2 == 0 && j % 2 == 0) ||
          (i % 2 == 1 && j % 2 == 1)
        ) {
          ctx.drawImage(texture2, 100 + 100 * i, 800 - 100 * j, 100, 100);
        } else {
          ctx.drawImage(texture4, 100 + 100 * i, 800 - 100 * j, 100, 100);
        }

        if (o.isMine) {
          const mine = await loadImage(
            "https://raw.githubusercontent.com/KhoaDo472005/minesweeper/main/bomb.png"
          );
          ctx.drawImage(mine, 100 + 100 * i, 800 - 100 * j, 100, 100);
        } else {
          const number = await loadImage(
            `https://raw.githubusercontent.com/KhoaDo472005/minesweeper/main/no${o.adjacentMines}.png`
          );
          ctx.drawImage(number, 100 + 100 * i, 800 - 100 * j, 100, 100);
        }
      } else {
        if (
          (i % 2 == 0 && j % 2 == 0) ||
          (i % 2 == 1 && j % 2 == 1)
        ) {
          ctx.drawImage(texture1, 100 + 100 * i, 800 - 100 * j, 100, 100);
        } else {
          ctx.drawImage(texture3, 100 + 100 * i, 800 - 100 * j, 100, 100);
        }

        if (o.markked) {
          ctx.drawImage(co, 100 + 100 * i, 800 - 100 * j, 100, 100);
        }
      }
    }
  }

  const filePath = path.join(dirpath, `${id}.png`);
  await fs.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

function delData(id: string): void {
  const jsonPath = path.join(dirpath, `${id}.json`);
  const pngPath = path.join(dirpath, `${id}.png`);
  const avtPath = path.join(dirpath, `avt${id}.png`);

  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
  if (fs.existsSync(avtPath)) fs.unlinkSync(avtPath);
}

async function loadAvt(id: string): Promise<void> {
  const response = await axios.get(
    `https://graph.facebook.com/${id}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
    { responseType: "arraybuffer" }
  );
  const avtPath = path.join(dirpath, `avt${id}.png`);
  await fs.writeFile(avtPath, Buffer.from(response.data));
}

async function createMap(numberOfMines: number): Promise<GameMap> {
  const map: GameMap = [] as unknown as GameMap;

  for (let i = 0; i < 10; i++) {
    const row: Cell[] = [];
    for (let j = 0; j < 7; j++) {
      row.push({
        opened: false,
        isMine: false,
        markked: false,
        adjacentMines: 0,
      });
    }
    map.push(row);
  }

  (map[0][0] as any).complete = 0;
  (map[0][0] as any).flag = 0;
  (map[0][0] as any).mode = numberOfMines;

  let minesCount = 0;
  while (minesCount < numberOfMines) {
    const x = Math.floor(Math.random() * 10);
    const y = Math.floor(Math.random() * 7);
    const row = map[x];
    if (!row) continue;
    const cell = row[y];
    if (!cell) continue;
    if (!cell.isMine) {
      cell.isMine = true;
      minesCount++;
    }
  }

  const directions = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  for (let i = 0; i < 10; i++) {
    const row = map[i];
    if (!row) continue;
    for (let j = 0; j < 7; j++) {
      const cell = row[j];
      if (!cell) continue;
      if (!cell.isMine) {
        let count = 0;
        for (let k = 0; k < directions.length; k++) {
          const dir = directions[k];
          if (!dir || dir.length < 2) continue;
          const dx = dir[0];
          const dy = dir[1];
          if (dx === undefined || dy === undefined) continue;
          const newX = i + dx;
          const newY = j + dy;
          if (
            newX >= 0 &&
            newX < 10 &&
            newY >= 0 &&
            newY < 7
          ) {
            const newRow = map[newX];
            if (newRow) {
              const newCell = newRow[newY];
              if (newCell && newCell.isMine) {
                count++;
              }
            }
          }
        }
        cell.adjacentMines = count;
      }
    }
  }

  for (let i = 0; i < 10; i++) {
    const row = map[i];
    if (!row) continue;
    for (let j = 0; j < 7; j++) {
      const cell = row[j];
      if (!cell) continue;
      if (cell.adjacentMines == 0 && !cell.isMine) {
        cell.opened = true;
        const firstRow = map[0];
        if (firstRow && firstRow[0]) {
          (firstRow[0] as any).complete += 1;
        }
      }
    }
  }

  if (numberOfMines !== 10) {
    for (let i = 0; i < 10; i++) {
      const row = map[i];
      if (!row) continue;
      for (let j = 0; j < 7; j++) {
        const cell = row[j];
        if (!cell) continue;
        if (cell.adjacentMines != 0) {
          for (let k = 0; k < directions.length; k++) {
            const dir = directions[k];
            if (!dir || dir.length < 2) continue;
            const ex = dir[0];
            const ey = dir[1];
            if (ex === undefined || ey === undefined) continue;
            const neX = i + ex;
            const neY = j + ey;
            if (
              neX >= 0 &&
              neX < 10 &&
              neY >= 0 &&
              neY < 7
            ) {
              const newRow = map[neX];
              if (newRow) {
                const newCell = newRow[neY];
                if (newCell && newCell.adjacentMines == 0 && !newCell.isMine) {
                  cell.opened = true;
                  const firstRow = map[0];
                  if (firstRow && firstRow[0]) {
                    (firstRow[0] as any).complete += 1;
                  }
                  continue;
                }
              }
            }
          }
        }
      }
    }
  }

  return map;
}

const dominCommand: Command = {
  name: "domin",
  alias: ["domin"],
  version: "1.0.0",
  role: 0,
  desc: "Dò mìn",
  guide:
    "   1. Gõ {pn} để bắt đầu chơi\n" +
    "   2. Chọn chế độ chơi:\n" +
    "      - Dễ: 10 quả mìn\n" +
    "      - Trung bình: 15 quả mìn\n" +
    "      - Khó: 20 quả mìn\n" +
    "   3. Thao tác trong game:\n" +
    "      - Đào ô: 1 + tọa độ (VD: 1 E5)\n" +
    "      - Cắm cờ: 2 + tọa độ (VD: 2 E5)\n" +
    "      - Gỡ cờ: 3 + tọa độ (VD: 3 E5)\n" +
    "   Lưu ý: Có thể thao tác nhiều ô cùng lúc (VD: 1 E5 F3 G2)\n\n",
  cd: 0,
  prefix: true,

  onLoad: async (ctx: CommandOnLoadContext) => {
    if (!fs.existsSync(dirpath)) {
      await fs.ensureDir(dirpath);
    }
  },

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, main, commandName } = ctx;
    const { threadID, messageID, senderID } = event;

    const choose: string[] = ["1", "2"];
    let text = "Reply lựa chọn!\n1. Chơi mới\n2. Hướng dẫn";

    const jsonPath = path.join(dirpath, `${senderID}.json`);
    if (fs.existsSync(jsonPath)) {
      choose.push("3");
      text += "\n3. Chơi tiếp";
    }

    await client.sendMessage(
      text,
      threadID,
      (error?: Error, info?: unknown) => {
        const msgInfo = info as { messageID?: string } | undefined;
        if (msgInfo?.messageID) {
          main.onReply.set(msgInfo.messageID, {
            commandName,
            messageID: msgInfo.messageID,
            author: senderID,
            invalidC: choose,
            type: "procedure",
          });
        }
      },
      messageID
    );
  },

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, unsend, Reply, main, commandName } = ctx;
    const { threadID: tid, messageID: mid, senderID: sid, args } = event;

    try {
      const replyData = Reply as { author?: string; type?: string; messageID?: string; invalidC?: string[] };
      if (sid !== replyData.author) return;

      if (replyData.type === "newgame") {
        const mode = parseInt(event.body || "0");
        if (![1, 2, 3].includes(mode)) {
          await client.sendMessage("❌ Lựa chọn không hợp lệ!", tid, mid);
          return;
        }

        if (unsend && replyData.messageID) await unsend(replyData.messageID);
        await client.sendMessage("Đang tạo...", tid, mid);

        const mine = 5 + 5 * mode;
        let map = await createMap(mine);

        while ((map[0][0] as any).complete === 0) {
          map = await createMap(mine);
        }

        const avtPath = path.join(dirpath, `avt${sid}.png`);
        if (!fs.existsSync(avtPath)) {
          await loadAvt(sid);
        }

        const jsonPath = path.join(dirpath, `${sid}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(map, null, 2));

        const imagePath = await draw(map, sid);
        await client.sendMessage(
          {
            body: "1. Đào lên\n2. Đánh dấu\n3. Bỏ đánh dấu\nVd: 1 E5 (đào ô E5)",
            attachment: fs.createReadStream(imagePath),
          },
          tid,
          (error?: Error, info?: unknown) => {
            const msgInfo = info as { messageID?: string } | undefined;
            if (msgInfo?.messageID) {
              main.onReply.set(msgInfo.messageID, {
                commandName,
                messageID: msgInfo.messageID,
                author: sid,
                type: "play",
              });
            }
          },
          mid
        );
        return;
      }

      if (replyData.type === "procedure") {
        if (!replyData.invalidC?.includes(event.body || "")) {
          await client.sendMessage("❌ Lựa chọn không hợp lệ!", tid, mid);
          return;
        }

        if (event.body === "1") {
          if (unsend && replyData.messageID) await unsend(replyData.messageID);
          await client.sendMessage(
            "Chọn chế độ:\n1. Dễ (10 mìn)\n2. Trung bình (15 mìn)\n3. Khó (20 mìn)",
            tid,
            (error?: Error, info?: unknown) => {
              const msgInfo = info as { messageID?: string } | undefined;
              if (msgInfo?.messageID) {
                main.onReply.set(msgInfo.messageID, {
                  commandName,
                  messageID: msgInfo.messageID,
                  author: sid,
                  type: "newgame",
                });
              }
            },
            mid
          );
          return;
        }

        if (event.body === "2") {
          await client.sendMessage(texthelp, tid, mid);
          return;
        }

        if (event.body === "3") {
          try {
            if (unsend && replyData.messageID) await unsend(replyData.messageID);

            const avtPath = path.join(dirpath, `avt${sid}.png`);
            if (!fs.existsSync(avtPath)) {
              await loadAvt(sid);
            }

            const jsonPath = path.join(dirpath, `${sid}.json`);
            const map: GameMap = JSON.parse(
              await fs.readFile(jsonPath, "utf-8")
            );

            const imagePath = await draw(map, sid);
            await client.sendMessage(
              {
                body: "1. Đào lên\n2. Đánh dấu\n3. Bỏ đánh dấu\nVd: 1 E5 (đào ô E5)",
                attachment: fs.createReadStream(imagePath),
              },
              tid,
              (error?: Error, info?: unknown) => {
                const msgInfo = info as { messageID?: string } | undefined;
                if (msgInfo?.messageID) {
                  main.onReply.set(msgInfo.messageID, {
                    commandName,
                    messageID: msgInfo.messageID,
                    author: sid,
                    type: "play",
                  });
                }
              },
              mid
            );
            return;
          } catch (error: any) {
            console.log(error);
            await client.sendMessage(
              `❌ Đã xảy ra lỗi!\n Vui lòng thử lại hoặc chơi mới\n Chi tiết lỗi:\n${error}`,
              tid,
              mid
            );
            return;
          }
        }
      }

      if (replyData.type === "play") {
        const jsonPath = path.join(dirpath, `${sid}.json`);
        const map: GameMap = JSON.parse(await fs.readFile(jsonPath, "utf-8"));

        if (!args || args.length === 0) {
          await client.sendMessage("❌ Cú pháp không hợp lệ!", tid, mid);
          return;
        }

        const choose = parseInt(args[0] || "0");
        if (![1, 2, 3].includes(choose)) {
          await client.sendMessage("❌ Cú pháp không hợp lệ!", tid, mid);
          return;
        }

        const string = "ABCDEFGHIK";

        async function openAll(board: GameMap): Promise<GameMap> {
          for (let i = 0; i < 10; i++) {
            const row = board[i];
            if (!row) continue;
            for (let j = 0; j < 7; j++) {
              const cell = row[j];
              if (!cell) continue;
              if (!cell.opened) cell.opened = true;
              if (cell.markked) cell.markked = false;
            }
          }
          return board;
        }

        if (choose === 1) {
          
          if (args.length === 1) {
            await client.sendMessage(
              "❌ Vui lòng nhập các tọa độ cần đào!",
              tid,
              mid
            );
            return;
          }

          if (unsend && replyData.messageID) await unsend(replyData.messageID);

          const success: string[] = [];

          for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (!arg) continue;
            const x = string.indexOf(arg.slice(0, 1).toUpperCase());
            if (x === -1 || x < 0 || x >= 10) continue;

            const y = parseInt(arg.slice(1, 2));
            if (isNaN(y) || y < 0 || y > 6) continue;

            const row = map[x];
            if (!row) continue;
            const cell = row[y];
            if (!cell) continue;

            if (cell.opened) continue;
            if (cell.markked) continue;

            success.push("" + x + y);
            cell.opened = true;
            const firstRow = map[0];
            if (firstRow && firstRow[0]) {
              (firstRow[0] as any).complete += 1;
            }

            if (cell.isMine) {
              const imagePath = await draw(map, sid);
              await client.sendMessage(
                {
                  body: "Trò chơi kết thúc!\nBạn đã đào trúng mìn 💣",
                  attachment: fs.createReadStream(imagePath),
                },
                tid,
                () => delData(sid),
                mid
              );
              return;
            }
          }

          if ((map[0][0] as any).complete === 70 - (map[0][0] as any).mode) {
            const openedMap = await openAll(map);
            const imagePath = await draw(openedMap, sid);
            await client.sendMessage(
              {
                body: "🏆 Bạn đã thắng!",
                attachment: fs.createReadStream(imagePath),
              },
              tid,
              () => delData(sid),
              mid
            );
          }

          await fs.writeFile(jsonPath, JSON.stringify(map, null, 2));
          const imagePath = await draw(map, sid);
          await client.sendMessage(
            {
              body: `Đào thành công: ${success.length} ô\n1. Đào lên\n2. Đánh dấu\n3. Bỏ đánh dấu\nVd: 1 E5 (đào ô E5)`,
              attachment: fs.createReadStream(imagePath),
            },
            tid,
            (error?: Error, info?: unknown) => {
              const msgInfo = info as { messageID?: string } | undefined;
              if (msgInfo?.messageID) {
                main.onReply.set(msgInfo.messageID, {
                  commandName,
                  messageID: msgInfo.messageID,
                  author: sid,
                  type: "play",
                });
              }
            },
            mid
          );
          return;
        }

        if (choose === 2) {
          
          if (args.length === 1) {
            await client.sendMessage(
              "❌ Vui lòng nhập các tọa độ cần đánh dấu!",
              tid,
              mid
            );
            return;
          }

          if (unsend && replyData.messageID) await unsend(replyData.messageID);

          const success: string[] = [];

          for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (!arg) continue;
            const x = string.indexOf(arg.slice(0, 1).toUpperCase());
            if (x === -1 || x < 0 || x >= 10) continue;

            const y = parseInt(arg.slice(1, 2));
            if (isNaN(y) || y < 0 || y > 6) continue;

            const row = map[x];
            if (!row) continue;
            const cell = row[y];
            if (!cell) continue;

            if (cell.markked) continue;
            if (cell.opened) continue;

            cell.markked = true;
            const firstRow = map[0];
            if (firstRow && firstRow[0]) {
              (firstRow[0] as any).flag += 1;
            }
            success.push("" + x + y);
          }

          const firstRow = map[0];
          const firstCell = firstRow?.[0];
          if (firstCell && (firstCell as any).flag === (firstCell as any).mode) {
            let correct = 0;
            for (let i = 0; i < 10; i++) {
              const row = map[i];
              if (!row) continue;
              for (let j = 0; j < 7; j++) {
                const cell = row[j];
                if (cell && cell.markked && cell.isMine) correct++;
              }
            }

            if (correct === (map[0][0] as any).mode) {
              const openedMap = await openAll(map);
              const imagePath = await draw(openedMap, sid);
              await client.sendMessage(
                {
                  body: "🏆 Bạn đã thắng!",
                  attachment: fs.createReadStream(imagePath),
                },
                tid,
                () => delData(sid),
                mid
              );
              return;
            }
          }

          await fs.writeFile(jsonPath, JSON.stringify(map, null, 2));
          const imagePath = await draw(map, sid);
          await client.sendMessage(
            {
              body: `Đánh dấu thành công: ${success.length} ô\n1. Đào lên\n2. Đánh dấu\n3. Bỏ đánh dấu\nVd: 1 E5 (đào ô E5)`,
              attachment: fs.createReadStream(imagePath),
            },
            tid,
            (error?: Error, info?: unknown) => {
              const msgInfo = info as { messageID?: string } | undefined;
              if (msgInfo?.messageID) {
                main.onReply.set(msgInfo.messageID, {
                  commandName,
                  messageID: msgInfo.messageID,
                  author: sid,
                  type: "play",
                });
              }
            },
            mid
          );
          return;
        }

        if (choose === 3) {
          
          if (args.length === 1) {
            await client.sendMessage(
              "❌ Vui lòng nhập các tọa độ cần đánh dấu!",
              tid,
              mid
            );
            return;
          }

          if (unsend && replyData.messageID) await unsend(replyData.messageID);

          const success: string[] = [];

          for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (!arg) continue;
            const x = string.indexOf(arg.slice(0, 1).toUpperCase());
            if (x === -1 || x < 0 || x >= 10) continue;

            const y = parseInt(arg.slice(1, 2));
            if (isNaN(y) || y < 0 || y > 6) continue;

            const row = map[x];
            if (!row) continue;
            const cell = row[y];
            if (!cell) continue;

            if (!cell.markked) continue;

            cell.markked = false;
            const firstRow = map[0];
            if (firstRow && firstRow[0]) {
              (firstRow[0] as any).flag--;
            }
            success.push("" + x + y);
          }

          const firstRow = map[0];
          const firstCell = firstRow?.[0];
          if (firstCell && (firstCell as any).flag === (firstCell as any).mode) {
            let correct = 0;
            for (let i = 0; i < 10; i++) {
              const row = map[i];
              if (!row) continue;
              for (let j = 0; j < 7; j++) {
                const cell = row[j];
                if (cell && cell.markked && cell.isMine) correct++;
              }
            }

            if (firstCell && correct === (firstCell as any).mode) {
              const openedMap = await openAll(map);
              const imagePath = await draw(openedMap, sid);
              await client.sendMessage(
                {
                  body: "🏆 Bạn đã thắng!",
                  attachment: fs.createReadStream(imagePath),
                },
                tid,
                () => delData(sid),
                mid
              );
              return;
            }
          }

          await fs.writeFile(jsonPath, JSON.stringify(map, null, 2));
          const imagePath = await draw(map, sid);
          await client.sendMessage(
            {
              body: `Bỏ đánh dấu thành công: ${success.length} ô\n1. Đào lên\n2. Đánh dấu\n3. Bỏ đánh dấu\nVd: 1 E5 (đào ô E5)`,
              attachment: fs.createReadStream(imagePath),
            },
            tid,
            (error?: Error, info?: unknown) => {
              const msgInfo = info as { messageID?: string } | undefined;
              if (msgInfo?.messageID) {
                main.onReply.set(msgInfo.messageID, {
                  commandName,
                  messageID: msgInfo.messageID,
                  author: sid,
                  type: "play",
                });
              }
            },
            mid
          );
          return;
        }
      }
    } catch (error: any) {
      console.log(error);
      await client.sendMessage(
        `Đã xảy ra lỗi! ${error}`,
        tid,
        mid
      );
    }
  },
};

export default dominCommand;
