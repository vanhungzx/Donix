// Type declaration for the AI lamnet/4k subcommand module used by bot.ts
// This fixes TS module resolution for dynamic import("./4k.js").

interface LamnetSubModuleRunContext {
  // We don't depend on the exact shape here; the concrete context
  // is constructed in bot.ts before being passed in.
  [key: string]: unknown;
}

export interface LamnetRunModule {
  run: (ctx: LamnetSubModuleRunContext) => void | Promise<void>;
  default?: LamnetRunModule;
}

declare module "./4k.js" {
  const mod: LamnetRunModule;
  export = mod;
}

