import * as path from "path";
import { fileURLToPath } from "url";
import log from "@log";
import { loadApiMethods } from "../loader.js";
import type { Client, Context, DefaultFuncs } from "../request/formatters/helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function attachClientMethods(
  client: Client,
  def: DefaultFuncs,
  ctx: Context,
  libDir: string = path.join(__dirname, "../detail")
): Promise<void> {
  try {
    const { methods } = await loadApiMethods({
      libPath: libDir,
      bot: client,
      client: client,
      ctx,
      defaultFuncs: def
    });
    methods.forEach((handler, methodName) => {
      (client as any)[methodName] = handler;
    });
  } catch (err: any) {
    log.warn(`Failed to load client methods from ${libDir}: ${err?.message || err}`);
  }
}
