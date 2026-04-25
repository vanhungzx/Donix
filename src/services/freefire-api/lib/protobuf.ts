type ProtoModule = {
  encode(filename: string, messageName: string, payload: Record<string, unknown>, shouldEncrypt?: boolean): Promise<Buffer>;
  decode(filename: string, messageName: string, buffer: Buffer): Promise<Record<string, unknown>>;
};

const mod = require("./protobuf.js") as ProtoModule;

export const encode = mod.encode.bind(mod);
export const decode = mod.decode.bind(mod);
export default mod;
