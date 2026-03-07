

export interface Logger {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string, ...args: (string | number | boolean | Error | null | undefined)[]) => void;
  success?: (msg: string) => void;
  system?: (msg: string) => void;
}
