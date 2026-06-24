const protobuf = require('protobufjs');
const path = require('path');
const { encrypt } = require('./crypto.js');
const PROTO_DIR = path.join(__dirname, '../proto');

class ProtoHandler {
    constructor() {
        this.roots = {};
    }

    async load(filename) {
        if (!this.roots[filename]) {
            this.roots[filename] = await protobuf.load(path.join(PROTO_DIR, filename));
        }
        return this.roots[filename];
    }

    async encode(filename, messageName, payload, shouldEncrypt = true) {
        const root = await this.load(filename);
        const Type = root.lookupType(messageName);

        const errMsg = Type.verify(payload);
        if (errMsg) throw Error(errMsg);

        const message = Type.create(payload);
        const buffer = Type.encode(message).finish();

        if (shouldEncrypt) {
            return encrypt(buffer);
        }
        return buffer;
    }

    async decode(filename, messageName, buffer) {
        const root = await this.load(filename);
        const Type = root.lookupType(messageName);

        const message = Type.decode(buffer);
        return Type.toObject(message, {
            longs: String,
            enums: String,
            bytes: String,
            defaults: true,
            arrays: true
        });
    }
}

const protoHandler = new ProtoHandler();
module.exports = protoHandler;
