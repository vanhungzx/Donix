import * as fs from "fs";
import FreeFireAPI from "./index.js";

type MessageType = "request" | "response";

type PacketLike = {
  base64?: string;
  hex?: string;
  [key: string]: unknown;
};

type InspectorOptions = {
  maxDepth?: number;
  endpointName?: string;
  messageType?: MessageType;
};

type GenericParams = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

type SessionInfo = {
  token: string | null;
  serverUrl: string | null;
  openId: string | null;
  accountId: number | string | null;
};

type FreeFireApiClient = {
  login(uid?: string | null, password?: string | null, options?: Record<string, unknown>): Promise<SessionInfo>;
  searchAccount(keyword: string): Promise<unknown[]>;
  getPlayerStats(uid: string, gamemode: "br" | "cs", matchmode: "CAREER" | "NORMAL" | "RANKED"): Promise<JsonObject>;
  getPlayerProfile(uid: number): Promise<JsonObject>;
  getPlayerItems(uid: number): Promise<JsonObject | null>;
  getRecommendedFriend(): Promise<unknown[]>;
  getAccountOutfit(uid: string | number): Promise<JsonObject>;
  getPlayerGalleryShowInfo(uid: string | number, signatureMd5: string): Promise<JsonObject>;
  getVisitors(): Promise<PacketLike>;
  getInteractionRecord(): Promise<PacketLike>;
  getAccountAchievementInfo(): Promise<PacketLike>;
  getWorkshopAuthorInfo(uid: string | number, region: string): Promise<PacketLike>;
  getSpecialFriendList(uid: string | number): Promise<PacketLike>;
  getPlayerCSRankingInfoByAccountID(uid: string | number): Promise<PacketLike>;
  getOccupationInfo(): Promise<PacketLike>;
  createGuestAccount(options: Record<string, unknown>): Promise<JsonObject>;
  ping(): Promise<JsonObject>;
  getLoginData(): Promise<PacketLike>;
  loginGetDesc(region: string): Promise<PacketLike>;
  loginGetSplash(region: string): Promise<PacketLike>;
  loginGetProfile(): Promise<PacketLike>;
};

type FreeFireApiCtor = new () => FreeFireApiClient;
const FreeFireAPIClass = FreeFireAPI as unknown as FreeFireApiCtor;

type CanvasData = Record<string, unknown>;
type CanvasMapper = (stats: JsonObject, uid: string, server: string, matchmode: string) => CanvasData;
type CanvasRenderer = (data: CanvasData) => Buffer;

const {
  renderFreeFireStatsCanvas,
  mapPlayerStatsToCanvasData,
  renderFreeFireCSStatsCanvas,
  mapCSStatsToCanvasData
} = require("./freefireStatsCanvas.js") as {
  renderFreeFireStatsCanvas: CanvasRenderer;
  mapPlayerStatsToCanvasData: CanvasMapper;
  renderFreeFireCSStatsCanvas: CanvasRenderer;
  mapCSStatsToCanvasData: CanvasMapper;
};

type InspectorResult = Record<string, unknown>;
type RawInspectorFn = (packet: PacketLike, options: InspectorOptions) => InspectorResult;
type RuleMap = Record<string, Record<number, string>>;

const {
  inspectRawPacket,
  inspectEncryptedPacket,
  endpointRequestFieldRules,
  endpointResponseFieldRules
} = require("./lib/protoWireInspector.js") as {
  inspectRawPacket: RawInspectorFn;
  inspectEncryptedPacket: RawInspectorFn;
  endpointRequestFieldRules: RuleMap;
  endpointResponseFieldRules: RuleMap;
};

async function getApi(): Promise<FreeFireApiClient> {
  const api = new FreeFireAPIClass();
  await api.login();
  return api;
}

function requireUid(params: GenericParams): string {
  const uid = params.uid;
  if (!uid) throw new Error("UID parameter is required");
  const uidText = String(uid);
  if (!/^\d+$/.test(uidText)) throw new Error("UID must be a numeric value");
  return uidText;
}

function requirePacket(params: GenericParams): PacketLike {
  const packet = params.packet;
  if (!packet || typeof packet !== "object") {
    throw new Error("packet parameter is required and must be an object");
  }
  return packet as PacketLike;
}

export async function searchAccount(params: GenericParams): Promise<unknown[]> {
  const searchTerm = String(params.keyword ?? "");
  if (!searchTerm) throw new Error("Keyword parameter is required");
  if (searchTerm.trim().length < 3) throw new Error("Keyword must be at least 3 characters long");
  const api = await getApi();
  return api.searchAccount(searchTerm);
}

export async function getPlayerStatsService(
  params: GenericParams
): Promise<{ success: true; data: JsonObject; metadata: Record<string, string> }> {
  const server = String(params.server ?? "IND").toUpperCase();
  const uid = requireUid(params);
  const gamemode = String(params.gamemode ?? "br").toLowerCase();
  const matchmode = String(params.matchmode ?? "CAREER").toUpperCase();

  if (!["br", "cs"].includes(gamemode)) throw new Error("Gamemode must be 'br' or 'cs'");
  if (!["CAREER", "NORMAL", "RANKED"].includes(matchmode)) {
    throw new Error("Matchmode must be 'CAREER', 'NORMAL', or 'RANKED'");
  }

  const api = await getApi();
  const playerStats = await api.getPlayerStats(
    uid,
    gamemode as "br" | "cs",
    matchmode as "CAREER" | "NORMAL" | "RANKED"
  );
  if (!playerStats) throw new Error("No player statistics found for the given parameters");

  return {
    success: true,
    data: playerStats,
    metadata: { server, uid, gamemode, matchmode }
  };
}

export async function getPlayerPersonalShowService(params: GenericParams): Promise<JsonObject> {
  const uid = params.uid;
  if (!uid) throw new Error("Empty 'uid' parameter. Please provide a valid 'uid'.");
  const uidInt = Number.parseInt(String(uid), 10);
  if (Number.isNaN(uidInt) || uidInt <= 0) throw new Error("UID must be a positive integer.");
  const api = await getApi();
  const result = await api.getPlayerProfile(uidInt);
  if (!result) throw new Error(`No player data found for UID: ${uidInt}`);
  return result;
}

function mapPersonalShowToReadable(raw: JsonObject = {}): JsonObject {
  const basic = (raw.basicinfo as JsonObject | undefined) ?? {};
  const profile = (raw.profileinfo as JsonObject | undefined) ?? {};
  const clan = (raw.clanbasicinfo as JsonObject | undefined) ?? {};
  const captain = (raw.captainbasicinfo as JsonObject | undefined) ?? {};
  const pet = (raw.petinfo as JsonObject | undefined) ?? {};
  const social = (raw.socialinfo as JsonObject | undefined) ?? {};
  const credit = (raw.creditscoreinfo as JsonObject | undefined) ?? {};
  const rankPos = (raw.rankingleaderboardpos as JsonObject | undefined) ?? {};

  return {
    basic: {
      accountId: basic.accountid ?? null,
      nickname: basic.nickname ?? null,
      region: basic.region ?? null
    },
    rank: {
      leaderboardPosition: rankPos,
      modeStatsSummary: raw.modestatssummaryinfo ?? null,
      mmrList: raw.mmrlist ?? []
    },
    guild: {
      clanId: clan.clanid ?? null,
      clanName: clan.clanname ?? null,
      captainId: captain.accountid ?? null,
      captainNickname: captain.nickname ?? null
    },
    pet: Object.keys(pet).length > 0 ? pet : null,
    social: {
      socialInfo: social,
      creditScoreInfo: credit
    },
    cosmetics: {
      avatarId: profile.avatarid ?? null,
      clothes: profile.clothes ?? [],
      equippedSkills: profile.equipedskills ?? [],
      tailorEffects: profile.clothestailoreffects ?? [],
      itemTags: profile.itemtaginfo ?? []
    },
    raw
  };
}

export async function getPlayerPersonalShowFullService(params: GenericParams): Promise<JsonObject> {
  const raw = await getPlayerPersonalShowService(params);
  return mapPersonalShowToReadable(raw);
}

export async function getPlayerItemsService(params: GenericParams): Promise<JsonObject | null> {
  const uid = params.uid;
  if (!uid) throw new Error("Empty 'uid' parameter. Please provide a valid 'uid'.");
  const uidInt = Number.parseInt(String(uid), 10);
  if (Number.isNaN(uidInt) || uidInt <= 0) throw new Error("UID must be a positive integer.");
  const api = await getApi();
  return api.getPlayerItems(uidInt);
}

export async function getStatsCanvasService(params: GenericParams): Promise<Record<string, unknown>> {
  const server = String(params.server ?? "VN").toUpperCase();
  const uid = requireUid(params);
  const gamemode = String(params.gamemode ?? "br").toLowerCase();
  const matchmode = String(params.matchmode ?? "CAREER").toUpperCase();
  if (!["br", "cs"].includes(gamemode)) throw new Error("Gamemode must be 'br' or 'cs'");
  if (matchmode !== "CAREER") throw new Error("Canvas rendering is only supported for matchmode 'CAREER'");

  const statsResult = await getPlayerStatsService({ server, uid, gamemode, matchmode });
  const stats = statsResult.data;

  if (gamemode === "br") {
    const canvasData = mapPlayerStatsToCanvasData(stats, uid, server, matchmode);
    return { success: true, contentType: "image/png", buffer: renderFreeFireStatsCanvas(canvasData), metadata: { server, uid, gamemode, matchmode } };
  }
  const canvasData = mapCSStatsToCanvasData(stats, uid, server, matchmode);
  return { success: true, contentType: "image/png", buffer: renderFreeFireCSStatsCanvas(canvasData), metadata: { server, uid, gamemode, matchmode } };
}

export async function getRecommendedFriendService(): Promise<unknown[]> {
  const api = await getApi();
  return (await api.getRecommendedFriend()) ?? [];
}

export async function getAccountOutfitService(params: GenericParams): Promise<JsonObject> {
  const uid = requireUid(params);
  return (await getApi()).getAccountOutfit(uid);
}
export async function getPlayerGalleryShowInfoService(params: GenericParams): Promise<JsonObject> {
  const uid = requireUid(params);
  const signatureMd5 = String(params.signatureMd5 ?? "");
  return (await getApi()).getPlayerGalleryShowInfo(uid, signatureMd5);
}
export async function getVisitorsService(): Promise<PacketLike> {
  return (await getApi()).getVisitors();
}
export async function getInteractionRecordService(): Promise<PacketLike> {
  return (await getApi()).getInteractionRecord();
}
export async function getAccountAchievementInfoService(): Promise<PacketLike> {
  return (await getApi()).getAccountAchievementInfo();
}
export async function getWorkshopAuthorInfoService(params: GenericParams): Promise<PacketLike> {
  const uid = requireUid(params);
  return (await getApi()).getWorkshopAuthorInfo(uid, String(params.region ?? "vn"));
}
export async function getSpecialFriendListService(params: GenericParams): Promise<PacketLike> {
  return (await getApi()).getSpecialFriendList(requireUid(params));
}
export async function getPlayerCSRankingInfoByAccountIDService(params: GenericParams): Promise<PacketLike> {
  return (await getApi()).getPlayerCSRankingInfoByAccountID(requireUid(params));
}
export async function getOccupationInfoService(): Promise<PacketLike> {
  return (await getApi()).getOccupationInfo();
}

export function inspectRawProtoService(params: GenericParams): InspectorResult {
  return inspectRawPacket(requirePacket(params), {
    maxDepth: typeof params.maxDepth === "number" ? params.maxDepth : undefined,
    endpointName: typeof params.endpointName === "string" ? params.endpointName : undefined,
    messageType: (params.messageType as MessageType | undefined) ?? "response"
  });
}

export function inspectRawProtoPresetService(params: GenericParams): InspectorResult {
  const preset = String(params.preset ?? "").trim();
  if (!preset) throw new Error("preset parameter is required");
  return inspectRawPacket(requirePacket(params), {
    maxDepth: typeof params.maxDepth === "number" ? params.maxDepth : undefined,
    endpointName: preset,
    messageType: (params.messageType as MessageType | undefined) ?? "response"
  });
}

export function inspectEncryptedProtoService(params: GenericParams): InspectorResult {
  return inspectEncryptedPacket(requirePacket(params), {
    maxDepth: typeof params.maxDepth === "number" ? params.maxDepth : undefined,
    endpointName: typeof params.endpointName === "string" ? params.endpointName : undefined,
    messageType: (params.messageType as MessageType | undefined) ?? "request"
  });
}

export function inspectEncryptedProtoFileService(params: GenericParams): InspectorResult {
  const filePath = String(params.filePath ?? "").trim();
  if (!filePath) throw new Error("filePath parameter is required");
  const buffer = fs.readFileSync(filePath);
  return inspectEncryptedPacket({ hex: buffer.toString("hex") }, {
    maxDepth: typeof params.maxDepth === "number" ? params.maxDepth : undefined,
    endpointName: typeof params.endpointName === "string" ? params.endpointName : undefined,
    messageType: (params.messageType as MessageType | undefined) ?? "request"
  });
}

export function getInspectorPresetsService(): { request: string[]; response: string[] } {
  return {
    request: Object.keys(endpointRequestFieldRules).sort(),
    response: Object.keys(endpointResponseFieldRules).sort()
  };
}

async function callAndInspect(
  callFn: () => Promise<PacketLike>,
  maxDepth = 2,
  endpointName = "",
  messageType: MessageType = "response"
): Promise<{ raw: PacketLike; decoded: InspectorResult }> {
  const raw = await callFn();
  const decoded = inspectRawPacket(raw, { maxDepth, endpointName, messageType });
  return { raw, decoded };
}

export async function getVisitorsDecodedService(params: GenericParams = {}): Promise<{ raw: PacketLike; decoded: InspectorResult }> {
  return callAndInspect(getVisitorsService, typeof params.maxDepth === "number" ? params.maxDepth : 2, "GetVisitors");
}
export async function getInteractionRecordDecodedService(params: GenericParams = {}): Promise<{ raw: PacketLike; decoded: InspectorResult }> {
  return callAndInspect(getInteractionRecordService, typeof params.maxDepth === "number" ? params.maxDepth : 2, "GetInteractionRecord");
}
export async function getAccountAchievementInfoDecodedService(params: GenericParams = {}): Promise<{ raw: PacketLike; decoded: InspectorResult }> {
  return callAndInspect(getAccountAchievementInfoService, typeof params.maxDepth === "number" ? params.maxDepth : 2, "GetAccountAchievementInfo");
}
export async function getWorkshopAuthorInfoDecodedService(params: GenericParams = {}): Promise<{ raw: PacketLike; decoded: InspectorResult }> {
  return callAndInspect(() => getWorkshopAuthorInfoService(params), typeof params.maxDepth === "number" ? params.maxDepth : 2, "GetWorkshopAuthorInfo");
}
export async function getSpecialFriendListDecodedService(params: GenericParams = {}): Promise<{ raw: PacketLike; decoded: InspectorResult }> {
  return callAndInspect(() => getSpecialFriendListService(params), typeof params.maxDepth === "number" ? params.maxDepth : 2, "GetSpecialFriendList");
}
export async function getPlayerCSRankingInfoByAccountIDDecodedService(params: GenericParams = {}): Promise<{ raw: PacketLike; decoded: InspectorResult }> {
  return callAndInspect(() => getPlayerCSRankingInfoByAccountIDService(params), typeof params.maxDepth === "number" ? params.maxDepth : 2, "GetPlayerCSRankingInfoByAccountID");
}
export async function getOccupationInfoDecodedService(params: GenericParams = {}): Promise<{ raw: PacketLike; decoded: InspectorResult }> {
  return callAndInspect(getOccupationInfoService, typeof params.maxDepth === "number" ? params.maxDepth : 2, "GetOccupationInfo");
}

export async function createGuestAccountService(params: GenericParams = {}): Promise<JsonObject> {
  const api = new FreeFireAPIClass();
  return api.createGuestAccount({
    region: String(params.region ?? "vn"),
    regAvatar: Number(params.regAvatar ?? 102000007),
    newbieChoice: Number(params.newbieChoice ?? 3),
    guestUid: params.guestUid,
    guestPassword: params.guestPassword,
    gopBearerToken: params.gopBearerToken,
    guestRegisterSignature: params.guestRegisterSignature,
    externalId: params.externalId,
    accountId: params.accountId
  });
}

export async function pingService(): Promise<JsonObject> {
  return (await getApi()).ping();
}
export async function getLoginDataService(): Promise<PacketLike> {
  return (await getApi()).getLoginData();
}
export async function loginGetDescService(params: GenericParams = {}): Promise<PacketLike> {
  return (await getApi()).loginGetDesc(String(params.region ?? "vn"));
}
export async function loginGetSplashService(params: GenericParams = {}): Promise<PacketLike> {
  return (await getApi()).loginGetSplash(String(params.region ?? "vn"));
}
export async function loginGetProfileService(): Promise<PacketLike> {
  return (await getApi()).loginGetProfile();
}

const freefireLibService = {
  searchAccount,
  getPlayerStats: getPlayerStatsService,
  getPlayerPersonalShow: getPlayerPersonalShowService,
  getPlayerPersonalShowFull: getPlayerPersonalShowFullService,
  getPlayerItems: getPlayerItemsService,
  getStatsCanvas: getStatsCanvasService,
  getRecommendedFriend: getRecommendedFriendService,
  getAccountOutfit: getAccountOutfitService,
  getPlayerGalleryShowInfo: getPlayerGalleryShowInfoService,
  getVisitors: getVisitorsService,
  getInteractionRecord: getInteractionRecordService,
  getAccountAchievementInfo: getAccountAchievementInfoService,
  getWorkshopAuthorInfo: getWorkshopAuthorInfoService,
  getSpecialFriendList: getSpecialFriendListService,
  getPlayerCSRankingInfoByAccountID: getPlayerCSRankingInfoByAccountIDService,
  getOccupationInfo: getOccupationInfoService,
  inspectRawProto: inspectRawProtoService,
  inspectRawProtoPreset: inspectRawProtoPresetService,
  inspectEncryptedProto: inspectEncryptedProtoService,
  inspectEncryptedProtoFile: inspectEncryptedProtoFileService,
  getInspectorPresets: getInspectorPresetsService,
  getVisitorsDecoded: getVisitorsDecodedService,
  getInteractionRecordDecoded: getInteractionRecordDecodedService,
  getAccountAchievementInfoDecoded: getAccountAchievementInfoDecodedService,
  getWorkshopAuthorInfoDecoded: getWorkshopAuthorInfoDecodedService,
  getSpecialFriendListDecoded: getSpecialFriendListDecodedService,
  getPlayerCSRankingInfoByAccountIDDecoded: getPlayerCSRankingInfoByAccountIDDecodedService,
  getOccupationInfoDecoded: getOccupationInfoDecodedService,
  createGuestAccount: createGuestAccountService,
  ping: pingService,
  getLoginData: getLoginDataService,
  loginGetDesc: loginGetDescService,
  loginGetSplash: loginGetSplashService,
  loginGetProfile: loginGetProfileService
};

export default freefireLibService;
