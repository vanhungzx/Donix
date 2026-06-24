export type PacketLike = {
  base64?: string;
  hex?: string;
  [key: string]: unknown;
};

export type InspectorOptions = {
  maxDepth?: number;
  endpointName?: string;
  messageType?: "request" | "response";
};

type InspectorModule = {
  inspectRawPacket(packet: PacketLike, options?: InspectorOptions): Record<string, unknown>;
  inspectEncryptedPacket(packet: PacketLike, options?: InspectorOptions): Record<string, unknown>;
  endpointRequestFieldRules: Record<string, Record<number, string>>;
  endpointResponseFieldRules: Record<string, Record<number, string>>;
};

const mod = require("./protoWireInspector.js") as InspectorModule;

export const inspectRawPacket = mod.inspectRawPacket;
export const inspectEncryptedPacket = mod.inspectEncryptedPacket;
export const endpointRequestFieldRules = mod.endpointRequestFieldRules;
export const endpointResponseFieldRules = mod.endpointResponseFieldRules;
export default mod;
