/**
 * Wrapper dùng CommonJS - acc lấy từ config/credentials.yaml (như test: api.login() không arg)
 * const FreeFireAPI = require('./index.js') → new FreeFireAPI() → login() → method
 */
const fs = require('fs');
const FreeFireAPI = require('./index.js');
const {
  renderFreeFireStatsCanvas,
  mapPlayerStatsToCanvasData,
  renderFreeFireCSStatsCanvas,
  mapCSStatsToCanvasData
} = require('./freefireStatsCanvas.js');
const {
  inspectRawPacket,
  inspectEncryptedPacket,
  endpointRequestFieldRules,
  endpointResponseFieldRules
} = require('./lib/protoWireInspector.js');

async function getApi() {
  const api = new FreeFireAPI();
  await api.login(); // không arg = dùng UID/PASSWORD từ config/credentials.yaml (DEFAULT_CREDENTIALS)
  return api;
}

async function searchAccount(params) {
  const searchTerm = params.keyword;
  if (!searchTerm) throw new Error('Keyword parameter is required');
  if (searchTerm.trim().length < 3) throw new Error('Keyword must be at least 3 characters long');

  const api = await getApi();
  return await api.searchAccount(searchTerm);
}

async function getPlayerStatsService(params) {
  const server = (params.server || 'IND').toUpperCase();
  const uid = params.uid;
  const gamemode = (params.gamemode || 'br').toLowerCase();
  const matchmode = (params.matchmode || 'CAREER').toUpperCase();

  if (!uid) throw new Error('UID parameter is required');
  if (!/^\d+$/.test(uid)) throw new Error('UID must be a numeric value');
  if (!['br', 'cs'].includes(gamemode)) throw new Error("Gamemode must be 'br' or 'cs'");
  if (!['CAREER', 'NORMAL', 'RANKED'].includes(matchmode)) throw new Error("Matchmode must be 'CAREER', 'NORMAL', or 'RANKED'");

  const api = await getApi();
  const playerStats = await api.getPlayerStats(uid, gamemode, matchmode);
  if (!playerStats) throw new Error('No player statistics found for the given parameters');

  return {
    success: true,
    data: playerStats,
    metadata: { server, uid, gamemode, matchmode }
  };
}

async function getPlayerPersonalShowService(params) {
  const server = (params.server || 'IND').toUpperCase();
  const uid = params.uid;
  if (!uid) throw new Error("Empty 'uid' parameter. Please provide a valid 'uid'.");
  const uidInt = parseInt(String(uid), 10);
  if (isNaN(uidInt) || uidInt <= 0) throw new Error('UID must be a positive integer.');

  const api = await getApi();
  const result = await api.getPlayerProfile(uidInt);
  if (!result) throw new Error(`No player data found for UID: ${uidInt}`);
  return result;
}

function _mapPersonalShowToReadable(raw = {}) {
  const basic = raw.basicinfo || {};
  const profile = raw.profileinfo || {};
  const clan = raw.clanbasicinfo || {};
  const captain = raw.captainbasicinfo || {};
  const pet = raw.petinfo || {};
  const social = raw.socialinfo || {};
  const credit = raw.creditscoreinfo || {};
  const rankPos = raw.rankingleaderboardpos || {};

  return {
    basic: {
      accountId: basic.accountid ?? null,
      nickname: basic.nickname ?? null,
      region: basic.region ?? null,
      level: basic.level ?? null,
      exp: basic.exp ?? null,
      likes: basic.liked ?? null,
      accountType: basic.accounttype ?? null,
      externalId: basic.externalid ?? null,
      createdAt: basic.createat ?? null,
      lastLoginAt: basic.lastloginat ?? null
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
    pet: pet || null,
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

async function getPlayerPersonalShowFullService(params) {
  const raw = await getPlayerPersonalShowService(params);
  return _mapPersonalShowToReadable(raw);
}

async function getPlayerItemsService(params) {
  const server = (params.server || 'IND').toUpperCase();
  const uid = params.uid;
  if (!uid) throw new Error("Empty 'uid' parameter. Please provide a valid 'uid'.");
  const uidInt = parseInt(String(uid), 10);
  if (isNaN(uidInt) || uidInt <= 0) throw new Error('UID must be a positive integer.');

  const api = await getApi();
  return await api.getPlayerItems(uidInt);
}

/**
 * Generate Free Fire stats canvas (PNG buffer) for BR/CS CAREER mode.
 * For other modes, this will throw because canvas is only designed for CAREER stats.
 */
async function getStatsCanvasService(params) {
  const server = (params.server || 'VN').toUpperCase();
  const uid = params.uid;
  const gamemode = (params.gamemode || 'br').toLowerCase();
  const matchmode = (params.matchmode || 'CAREER').toUpperCase();

  if (!uid) throw new Error('UID parameter is required');
  if (!/^\d+$/.test(uid)) throw new Error('UID must be a numeric value');
  if (!['br', 'cs'].includes(gamemode)) throw new Error("Gamemode must be 'br' or 'cs'");
  if (matchmode !== 'CAREER') {
    throw new Error("Canvas rendering is only supported for matchmode 'CAREER'");
  }

  const statsResult = await getPlayerStatsService({ server, uid, gamemode, matchmode });
  if (!statsResult || !statsResult.success) {
    throw new Error('Failed to fetch stats for canvas rendering');
  }

  const { data: stats } = statsResult;

  if (gamemode === 'br') {
    const canvasData = mapPlayerStatsToCanvasData(stats, uid, server, matchmode);
    const buffer = renderFreeFireStatsCanvas(canvasData);
    return {
      success: true,
      contentType: 'image/png',
      buffer,
      metadata: { server, uid, gamemode, matchmode }
    };
  }

  if (gamemode === 'cs') {
    const canvasData = mapCSStatsToCanvasData(stats, uid, server, matchmode);
    const buffer = renderFreeFireCSStatsCanvas(canvasData);
    return {
      success: true,
      contentType: 'image/png',
      buffer,
      metadata: { server, uid, gamemode, matchmode }
    };
  }

  throw new Error('Unsupported gamemode for canvas rendering');
}

async function getRecommendedFriendService() {
  const api = await getApi();
  const result = await api.getRecommendedFriend();
  if (!result) return [];
  return result;
}

async function getAccountOutfitService(params) {
  const uid = params?.uid;
  if (!uid) throw new Error('UID parameter is required');
  if (!/^\d+$/.test(String(uid))) throw new Error('UID must be a numeric value');

  const api = await getApi();
  return await api.getAccountOutfit(uid);
}

async function getPlayerGalleryShowInfoService(params) {
  const uid = params?.uid;
  const signatureMd5 = params?.signatureMd5 || '';

  if (!uid) throw new Error('UID parameter is required');
  if (!/^\d+$/.test(String(uid))) throw new Error('UID must be a numeric value');

  const api = await getApi();
  return await api.getPlayerGalleryShowInfo(uid, signatureMd5);
}

async function getVisitorsService() {
  const api = await getApi();
  return await api.getVisitors();
}

async function getInteractionRecordService() {
  const api = await getApi();
  return await api.getInteractionRecord();
}

async function getAccountAchievementInfoService() {
  const api = await getApi();
  return await api.getAccountAchievementInfo();
}

async function getWorkshopAuthorInfoService(params) {
  const uid = params?.uid;
  const region = params?.region || 'vn';
  if (!uid) throw new Error('UID parameter is required');
  if (!/^\d+$/.test(String(uid))) throw new Error('UID must be a numeric value');

  const api = await getApi();
  return await api.getWorkshopAuthorInfo(uid, region);
}

async function getSpecialFriendListService(params) {
  const uid = params?.uid;
  if (!uid) throw new Error('UID parameter is required');
  if (!/^\d+$/.test(String(uid))) throw new Error('UID must be a numeric value');

  const api = await getApi();
  return await api.getSpecialFriendList(uid);
}

async function getPlayerCSRankingInfoByAccountIDService(params) {
  const uid = params?.uid;
  if (!uid) throw new Error('UID parameter is required');
  if (!/^\d+$/.test(String(uid))) throw new Error('UID must be a numeric value');

  const api = await getApi();
  return await api.getPlayerCSRankingInfoByAccountID(uid);
}

async function getOccupationInfoService() {
  const api = await getApi();
  return await api.getOccupationInfo();
}

function inspectRawProtoService(params) {
  const packet = params?.packet;
  const maxDepth = params?.maxDepth;
  const endpointName = params?.endpointName;
  const messageType = params?.messageType || 'response';
  if (!packet || typeof packet !== 'object') {
    throw new Error('packet parameter is required and must be an object');
  }
  return inspectRawPacket(packet, { maxDepth, endpointName, messageType });
}

function inspectRawProtoPresetService(params) {
  const packet = params?.packet;
  const preset = String(params?.preset || '').trim();
  const maxDepth = params?.maxDepth;
  const messageType = params?.messageType || 'response';
  if (!packet || typeof packet !== 'object') {
    throw new Error('packet parameter is required and must be an object');
  }
  if (!preset) {
    throw new Error('preset parameter is required');
  }
  return inspectRawPacket(packet, {
    maxDepth,
    endpointName: preset,
    messageType
  });
}

function inspectEncryptedProtoService(params) {
  const packet = params?.packet;
  const maxDepth = params?.maxDepth;
  const endpointName = params?.endpointName;
  const messageType = params?.messageType || 'request';
  if (!packet || typeof packet !== 'object') {
    throw new Error('packet parameter is required and must be an object');
  }
  return inspectEncryptedPacket(packet, { maxDepth, endpointName, messageType });
}

function inspectEncryptedProtoFileService(params) {
  const filePath = String(params?.filePath || '').trim();
  const maxDepth = params?.maxDepth;
  const endpointName = params?.endpointName;
  const messageType = params?.messageType || 'request';

  if (!filePath) {
    throw new Error('filePath parameter is required');
  }

  const buffer = fs.readFileSync(filePath);
  return inspectEncryptedPacket(
    {
      hex: buffer.toString('hex')
    },
    { maxDepth, endpointName, messageType }
  );
}

function getInspectorPresetsService() {
  return {
    request: Object.keys(endpointRequestFieldRules).sort(),
    response: Object.keys(endpointResponseFieldRules).sort()
  };
}

async function _callAndInspect(callFn, maxDepth = 2, endpointName = '', messageType = 'response') {
  const raw = await callFn();
  const decoded = inspectRawPacket(raw, { maxDepth, endpointName, messageType });
  return { raw, decoded };
}

async function getVisitorsDecodedService(params = {}) {
  const maxDepth = params?.maxDepth ?? 2;
  return _callAndInspect(() => getVisitorsService(), maxDepth, 'GetVisitors');
}

async function getInteractionRecordDecodedService(params = {}) {
  const maxDepth = params?.maxDepth ?? 2;
  return _callAndInspect(() => getInteractionRecordService(), maxDepth, 'GetInteractionRecord');
}

async function getAccountAchievementInfoDecodedService(params = {}) {
  const maxDepth = params?.maxDepth ?? 2;
  return _callAndInspect(() => getAccountAchievementInfoService(), maxDepth, 'GetAccountAchievementInfo');
}

async function getWorkshopAuthorInfoDecodedService(params = {}) {
  const maxDepth = params?.maxDepth ?? 2;
  return _callAndInspect(() => getWorkshopAuthorInfoService(params), maxDepth, 'GetWorkshopAuthorInfo');
}

async function getSpecialFriendListDecodedService(params = {}) {
  const maxDepth = params?.maxDepth ?? 2;
  return _callAndInspect(() => getSpecialFriendListService(params), maxDepth, 'GetSpecialFriendList');
}

async function getPlayerCSRankingInfoByAccountIDDecodedService(params = {}) {
  const maxDepth = params?.maxDepth ?? 2;
  return _callAndInspect(
    () => getPlayerCSRankingInfoByAccountIDService(params),
    maxDepth,
    'GetPlayerCSRankingInfoByAccountID'
  );
}

async function getOccupationInfoDecodedService(params = {}) {
  const maxDepth = params?.maxDepth ?? 2;
  return _callAndInspect(() => getOccupationInfoService(), maxDepth, 'GetOccupationInfo');
}

async function createGuestAccountService(params = {}) {
  const api = new FreeFireAPI();
  const result = await api.createGuestAccount({
    region: params?.region || 'vn',
    regAvatar: params?.regAvatar || 102000007,
    newbieChoice: params?.newbieChoice || 3,
    guestUid: params?.guestUid,
    guestPassword: params?.guestPassword,
    gopBearerToken: params?.gopBearerToken,
    guestRegisterSignature: params?.guestRegisterSignature,
    externalId: params?.externalId,
    accountId: params?.accountId
  });
  return result;
}

async function pingService() {
  const api = await getApi();
  return await api.ping();
}

async function getLoginDataService() {
  const api = await getApi();
  return await api.getLoginData();
}

async function loginGetDescService(params = {}) {
  const api = await getApi();
  return await api.loginGetDesc(params?.region || 'vn');
}

async function loginGetSplashService(params = {}) {
  const api = await getApi();
  return await api.loginGetSplash(params?.region || 'vn');
}

async function loginGetProfileService() {
  const api = await getApi();
  return await api.loginGetProfile();
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

module.exports = {
  ...freefireLibService,
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
