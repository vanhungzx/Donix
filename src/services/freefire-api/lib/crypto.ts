type CryptoModule = {
  encrypt(buffer: Buffer): Buffer;
  decrypt(buffer: Buffer): Buffer;
};

const mod = require("./crypto.js") as CryptoModule;

export const encrypt = mod.encrypt;
export const decrypt = mod.decrypt;
export default mod;
