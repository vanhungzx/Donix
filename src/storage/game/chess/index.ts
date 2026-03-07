import { createCanvas, loadImage, registerFont } from "canvas";
import { Chess, Square } from "chess.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type GameId = string | number;

type GameStateEntry = {
  id: GameId;
  fen: string;
};

type BoardResult = {
  status: true;
  play: "w" | "b";
  url: string;
};

type MoveResult =
  | {
    status: false;
    message: string;
    game?: "end";
    win?: "w" | "b";
  }
  | BoardResult;

type Player = Record<string, unknown> & { color?: "white" | "black" };

type PlayerResult =
  | {
    status: false;
    message: string;
  }
  | {
    status: true;
    message: string;
    start: "w" | "b";
    result: Player[];
  };

type RemoveResult =
  | { status: false; message: string }
  | { status: true; message: string };

type InitOptions = Partial<typeof CONFIG>;

const CONFIG = {
  canvasWidth: 700,
  canvasHeight: 700,
  imagesDir: path.join(__dirname, "chess"),
  statePath: path.join(__dirname, "game_state.json"),
  fontPath: path.join(__dirname, "font", "Montserrat-Bold.ttf"),
  piecesDir: path.join(__dirname, "image"),
  baseUrl: "",
};

const squareSize = CONFIG.canvasWidth / 8;
const lightColor = "#edeed1";
const darkColor = "#779952";
const specialLetters = ["a", "c", "e", "g"];

const pieces: Record<string, string> = {
  wk: "white-king.png",
  wq: "white-queen.png",
  wr: "white-rook.png",
  wb: "white-bishop.png",
  wn: "white-knight.png",
  wp: "white-pawn.png",
  bk: "black-king.png",
  bq: "black-queen.png",
  br: "black-rook.png",
  bb: "black-bishop.png",
  bn: "black-knight.png",
  bp: "black-pawn.png",
};

if (!fs.existsSync(CONFIG.imagesDir)) fs.mkdirSync(CONFIG.imagesDir, { recursive: true });
if (!fs.existsSync(CONFIG.statePath)) fs.writeFileSync(CONFIG.statePath, "[]");
if (fs.existsSync(CONFIG.fontPath)) registerFont(CONFIG.fontPath, { family: "font" });

function readState(): GameStateEntry[] {
  try {
    const raw = fs.readFileSync(CONFIG.statePath, "utf8");
    const arr = JSON.parse(raw) as GameStateEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeState(arr: GameStateEntry[]): void {
  fs.writeFileSync(CONFIG.statePath, JSON.stringify(arr, null, 4));
}

function getFen(id: GameId): string | null {
  const data = readState();
  const found = data.find(entry => entry.id === id);
  return found ? found.fen : null;
}

function setFen(id: GameId, fen: string): void {
  const data = readState();
  const idx = data.findIndex(entry => entry.id === id);
  if (idx !== -1 && data[idx]) {
    data[idx] = { ...data[idx], fen };
  } else {
    data.push({ id, fen });
  }
  writeState(data);
}

function imageOutputPath(id: GameId): string {
  return path.join(CONFIG.imagesDir, `${id}.png`);
}

function outUrlOrPath(id: GameId): string {
  if (CONFIG.baseUrl) return `${CONFIG.baseUrl.replace(/\/+$/, "")}/${id}.png`;
  return imageOutputPath(id);
}

async function drawChessBoard(fen: string) {
  const chesss = new Chess(fen);
  const canvas = createCanvas(CONFIG.canvasWidth, CONFIG.canvasHeight);
  const ctx = canvas.getContext("2d");
  const board = chesss.board();
  for (let row = 0; row < 8; row++) {
    const rowData = board[row];
    if (!rowData) continue;
    for (let col = 0; col < 8; col++) {
      const x = col * squareSize;
      const y = row * squareSize;
      const color = (row + col) % 2 === 0 ? lightColor : darkColor;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, squareSize, squareSize);
      if (col === 0) {
        ctx.font = "18px font";
        ctx.fillStyle = color === lightColor ? darkColor : lightColor;
        const number = 8 - row;
        ctx.fillText(String(number), x + 2, y + 15);
      }
      if (row === 7) {
        ctx.font = "18px font";
        const letter = String.fromCharCode(97 + col);
        ctx.fillStyle = specialLetters.includes(letter) ? lightColor : darkColor;
        ctx.fillText(letter, x + squareSize - 13, CONFIG.canvasHeight - 3);
      }
      const piece = rowData[col];
      if (piece) {
        const imageName = pieces[piece.color + piece.type];
        if (!imageName) continue;
        const img = await loadImage(path.join(CONFIG.piecesDir, imageName));
        ctx.drawImage(img, x, y, squareSize, squareSize);
      }
    }
  }
  return canvas;
}

async function drawChessBoardBlack(fen: string) {
  const chesss = new Chess(fen);
  const canvas = createCanvas(CONFIG.canvasWidth, CONFIG.canvasHeight);
  const ctx = canvas.getContext("2d");
  const board = chesss.board();
  for (let row = 7; row >= 0; row--) {
    const rowData = board[row];
    if (!rowData) continue;
    for (let col = 7; col >= 0; col--) {
      const x = (7 - col) * squareSize;
      const y = (7 - row) * squareSize;
      const color = (row + col) % 2 === 0 ? lightColor : darkColor;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, squareSize, squareSize);
      if (col === 7) {
        ctx.font = "18px font";
        ctx.fillStyle = color === lightColor ? darkColor : lightColor;
        const num = 8 - row;
        ctx.fillText(String(9 - num), x + 2, y + 15);
      }
      if (row === 0) {
        ctx.font = "18px font";
        const letter = String.fromCharCode(97 + (7 - col));
        ctx.fillStyle = specialLetters.includes(letter) ? lightColor : darkColor;
        ctx.fillText(letter, x + squareSize - 12, y + squareSize - 3);
      }
      const piece = rowData[col];
      if (piece) {
        const imageName = pieces[piece.color + piece.type];
        if (!imageName) continue;
        const img = await loadImage(path.join(CONFIG.piecesDir, imageName));
        ctx.drawImage(img, x, y, squareSize, squareSize);
      }
    }
  }
  return canvas;
}

function isPromotion(from: Square, to: Square, chess: Chess): boolean {
  const piece = chess.get(from);
  if (!piece || piece.type !== "p") return false;
  const rank = Number(to[1]);
  if (piece.color === "w" && rank === 8) return true;
  if (piece.color === "b" && rank === 1) return true;
  return false;
}

async function renderBoardToFile(fen: string, perspective: "w" | "b", outPath: string): Promise<void> {
  const canvas = perspective === "b" ? await drawChessBoardBlack(fen) : await drawChessBoard(fen);
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(outPath);
    canvas.createPNGStream().pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
  });
}

async function ensureGame(id: GameId): Promise<string> {
  let fen = getFen(id);
  if (!fen) {
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    setFen(id, fen);
  }
  return fen;
}

async function board(id: GameId): Promise<BoardResult> {
  const fen = await ensureGame(id);
  const chess = new Chess(fen);
  const outPath = imageOutputPath(id);
  const turn = chess.turn() as "w" | "b";
  await renderBoardToFile(fen, turn, outPath);
  return { status: true, play: turn, url: outUrlOrPath(id) };
}

async function move(id: GameId, from: string, to: string, promotion?: string): Promise<MoveResult> {
  const fen = await ensureGame(id);
  const chess = new Chess(fen);
  const fromSquare = from as Square;
  const toSquare = to as Square;
  const fromPiece = chess.get(fromSquare);
  if (!fromPiece) return { status: false, message: "Ô xuất phát không có quân." };
  if ((chess.turn() === "w" && fromPiece.color === "b") || (chess.turn() === "b" && fromPiece.color === "w"))
    return { status: false, message: chess.turn() === "w" ? "Lượt này bên trắng đi!" : "Lượt này bên đen đi!" };
  if (chess.isGameOver()) return { status: false, game: "end", win: chess.turn() as "w" | "b", message: chess.isCheckmate() ? "Chiếu hậu!" : "Hòa!" };
  const form: { from: Square; to: Square; promotion?: string } = { from: fromSquare, to: toSquare };
  if (isPromotion(fromSquare, toSquare, chess)) {
    if (!promotion) return { status: false, message: 'Vui lòng phong tốt để được đi tiếp\n\n"q": Hậu (Queen)\n"r": Xe (Rook)\n"n": Ngựa (Knight)\n"b": Tượng (Bishop)\n\nVí dụ: a7 a8 q' };
    form.promotion = promotion;
  }
  const moved = chess.move(form);
  if (!moved) return { status: false, message: "Nước đi không hợp lệ! Vui lòng thử lại." };
  const newFen = chess.fen();
  setFen(id, newFen);
  const outPath = imageOutputPath(id);
  const turn = chess.turn() as "w" | "b";
  await renderBoardToFile(newFen, turn, outPath);
  return { status: true, play: turn, url: outUrlOrPath(id) };
}

function randomColor(): "white" | "black" {
  return Math.random() < 0.5 ? "white" : "black";
}

async function getPlayer(id: GameId, playerBase64Json: string): Promise<PlayerResult> {
  const data = Buffer.from(String(playerBase64Json || ""), "base64").toString("utf8");
  let jsonData: Player[];
  try {
    jsonData = JSON.parse(data) as Player[];
  } catch {
    return { status: false, message: "Dữ liệu người chơi không hợp lệ." };
  }
  if (!Array.isArray(jsonData) || jsonData.length < 2) return { status: false, message: "Thiếu người chơi." };
  const [first, second] = jsonData;
  if (!first || !second) return { status: false, message: "Thiếu người chơi." };
  first.color = randomColor();
  second.color = first.color === "white" ? "black" : "white";
  const fen = await ensureGame(id);
  const ches = new Chess(fen);
  const turn = ches.turn() as "w" | "b";
  let msg = "Bên White đi trước";
  if (fen) msg = turn === "w" ? "White được phép di chuyển trong lượt tới" : "Black được phép di chuyển trong lượt tới";
  return { status: true, message: msg, start: turn, result: jsonData };
}

async function removeBoard(id: GameId): Promise<RemoveResult> {
  const data = readState();
  const found = data.find(entry => entry.id === id);
  if (!found) return { status: false, message: "Không có bàn cờ để xóa!" };
  const next = data.filter(entry => entry.id !== id);
  writeState(next);
  const img = imageOutputPath(id);
  if (fs.existsSync(img)) {
    try {
      fs.unlinkSync(img);
    } catch {
      
    }
  }
  return { status: true, message: "Đã xóa bàn cờ thành công!" };
}

function init(opts: InitOptions = {}): void {
  if (opts.canvasWidth) CONFIG.canvasWidth = opts.canvasWidth;
  if (opts.canvasHeight) CONFIG.canvasHeight = opts.canvasHeight;
  if (opts.imagesDir) CONFIG.imagesDir = opts.imagesDir;
  if (opts.statePath) CONFIG.statePath = opts.statePath;
  if (opts.fontPath) CONFIG.fontPath = opts.fontPath;
  if (opts.piecesDir) CONFIG.piecesDir = opts.piecesDir;
  if (opts.baseUrl) CONFIG.baseUrl = opts.baseUrl;
  if (!fs.existsSync(CONFIG.imagesDir)) fs.mkdirSync(CONFIG.imagesDir, { recursive: true });
  if (!fs.existsSync(CONFIG.statePath)) fs.writeFileSync(CONFIG.statePath, "[]");
  if (fs.existsSync(CONFIG.fontPath)) registerFont(CONFIG.fontPath, { family: "font" });
}

export { board, getPlayer, init, move, removeBoard };
export default { init, board, move, getPlayer, removeBoard };
