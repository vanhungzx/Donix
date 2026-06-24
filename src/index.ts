import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import * as path from "path";
import { fileURLToPath } from "url";
import log from "./utils/log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on("uncaughtException", (e: Error) => {
  // Ignore "write after end" errors as they're handled gracefully
  const errorMsg = e.message || String(e);
  if (errorMsg.includes("write after end") || errorMsg.includes("not opened")) {
    // Silently ignore these stream errors
    return;
  }
  log.error(`EXCEPTION: ${e.stack || e}`);
  process.exit(1);
});
process.on("unhandledRejection", (r: Error | string | number | boolean | object | null | undefined) => {
  // Ignore "write after end" errors in promise rejections
  const message = r instanceof Error ? r.message : String(r);
  if (message.includes("write after end") || message.includes("not opened")) {
    // Silently ignore these stream errors
    return;
  }
  log.error(`PROMISE: ${message}`);
  process.exit(1);
});
(["SIGINT", "SIGTERM"] as const).forEach(s => process.on(s, () => (log.warn(`Tín hiệu ${s}, thoát.`), process.exit(0))));

class Orchestrator extends EventEmitter {
  private script: string;
  private restarts: number[];
  private max: number;
  private win: number;
  private child?: ChildProcess;

  constructor(script: string = "core/main.ts") {
    super();
    this.script = path.resolve(__dirname, script);
    this.restarts = [];
    this.max = 10;
    this.win = 60_000;
    this.on("start", () => this.run());
    this.on("restart", (d: number) => setTimeout(() => this.emit("start"), d));
    this.on("fatal", (c: number) => log.error(`Dừng vĩnh viễn (exit code: ${c})`));
  }

  run(): void {
    this.restarts.push(Date.now());
    this.restarts = this.restarts.filter(t => Date.now() - t < this.win);
    if (this.restarts.length > this.max) {
      this.emit("fatal", 999);
      return;
    }

    log.success(`Khởi chạy bot lúc ${new Date().toLocaleTimeString()}`);

    const isTypeScript = this.script.endsWith(".ts");
    const command = "node";
    const scriptPath = path.isAbsolute(this.script) ? this.script : path.resolve(process.cwd(), this.script);
    //const args = isTypeScript ? ["--expose-gc", "--max-old-space-size=384", "--optimize-for-size", "--gc-interval=100", "--import", "tsx", scriptPath] : ["--trace-warnings", "--async-stack-traces", scriptPath];
    const args = isTypeScript ? ["--expose-gc", "--optimize-for-size", "--import", "tsx", scriptPath] : ["--trace-warnings", "--async-stack-traces", scriptPath];
    this.child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });

    this.child.on("close", (c: number | null, signal: NodeJS.Signals | null) => {
      const exitCode = c !== null ? c : (signal ? 130 : 0);
      log.warn(`Child process đóng với mã ${exitCode}${signal ? ` (signal: ${signal})` : ''}`);
      this.exit(exitCode);
    });
    this.child.on("error", (e: Error) => log.error(`Lỗi: ${e.message}`));
  }

  exit(code: number): void {
    log.warn(`Bot thoát với mã ${code}`);
    if ([1, 134].includes(code)) {
      log.info(`Phát hiện exit code ${code}, sẽ khởi động lại...`);
      this.emit("restart", 0);
    } else if (code >= 200 && code < 300) {
      const delay = (code - 200) * 1000;
      log.info(`Phát hiện exit code ${code}, sẽ khởi động lại sau ${delay}ms...`);
      this.emit("restart", delay);
    } else {
      log.error(`Exit code ${code} không được xử lý, dừng vĩnh viễn`);
      this.emit("fatal", code);
    }
  }
}

new Orchestrator().emit("start");
