/**
 * getPlayerInfo - dùng getPlayerPersonalShow từ service (freefire-api)
 */
const { getPlayerPersonalShow } = require('../service.js');
const { inspectRawPacket } = require('../lib/protoWireInspector.js');
const { resolveBRRank, resolveCSRank } = require('../lib/rankHelper.js');

async function loadProtos() {
  return true;
}

async function getPlayerInfo(region = 'VN', uid, needGalleryInfo = false, callSignSrc = 7) {
  const result = await getPlayerPersonalShow({
    server: region,
    uid,
    need_gallery_info: needGalleryInfo,
    call_sign_src: callSignSrc
  });
  if (!result) return null;

  const extractRawBasicVarints = (rawPacket) => {
    try {
      const inspected = inspectRawPacket(rawPacket, {
        endpointName: 'GetPlayerPersonalShow',
        messageType: 'response',
        maxDepth: 3
      });
      const fields = Array.isArray(inspected?.fields) ? inspected.fields : [];
      const basicField = fields.find((f) => f && f.field === 1 && Array.isArray(f.nested));
      const nested = Array.isArray(basicField?.nested) ? basicField.nested : [];
      const out = {};
      for (const item of nested) {
        if (item?.wireType === 0 && typeof item.field === 'number' && typeof item.value === 'number') {
          out[item.field] = item.value;
        }
      }
      return out;
    } catch (_) {
      return {};
    }
  };

  const rawBasic = extractRawBasicVarints(result._rawPacket);

  const historyRaw = Array.isArray(result.historyepinfo) ? result.historyepinfo : [];
  const history = historyRaw.map((entry) => ({
    ep_event_id: entry.epeventid ?? null,
    owned_pass: Boolean(entry.ownedpass),
    ep_badge: entry.epbadge ?? null,
    badge_count: entry.badgecnt ?? 0,
    bp_icon: entry.bpicon ?? null,
    max_level: entry.maxlevel ?? 0,
    event_name: entry.eventname ?? null
  }));

  const currentHistory = history[0] || null;
  const creditRaw = result.creditscoreinfo || {};
  const socialRaw = result.socialinfo || {};
  const modeSummary = result.modestatssummaryinfo || {};

  const creditScoreInfo = {
    score: creditRaw.creditscore ?? 0,
    is_init: Boolean(creditRaw.isinit),
    reward_state: creditRaw.rewardstate ?? '',
    periodic_likes: creditRaw.periodicsummarylikecnt ?? 0,
    periodic_illegal: creditRaw.periodicsummaryillegalcnt ?? 0,
    weekly_match_count: creditRaw.weeklymatchcnt ?? 0,
    periodic_summary_start_time: creditRaw.periodicsummarystarttime ?? 0,
    periodic_summary_end_time: creditRaw.periodicsummaryendtime ?? 0,
    summary_level: creditRaw.periodicsummarylevel ?? 0
  };

  const socialInfo = {
    ...socialRaw,
    rank_show: socialRaw.rankshow ?? null,
    time_online: socialRaw.timeonline ?? null,
    leaderboard_titles: socialRaw.leaderboardtitles ?? []
  };

  const rankRaw = result.rankinfo || {};
  const brRaw = rankRaw.br || rankRaw.brrank || rankRaw.brRank || {};
  const csRaw = rankRaw.cs || rankRaw.csrank || rankRaw.csRank || {};

  const brRankCode = Number(rawBasic[14] ?? 0);
  const brRankPoints = Number(rawBasic[15] ?? 0);
  const brMaxRankCode = Number(rawBasic[35] ?? 0);
  const brMaxRankPoints = Number(rawBasic[37] ?? 0);

  const csRankCode = Number(rawBasic[30] ?? 0);
  const csRankPoints = Number(rawBasic[31] ?? 0);
  const csMaxRankCode = Number(rawBasic[36] ?? 0);
  const csPeakPoints = Number(rawBasic[75] ?? 0);
  const csIsBan = Boolean(rawBasic[34] ?? false);

  const brResolved = resolveBRRank(
    brRankCode,
    brRankPoints,
    brMaxRankCode,
    brMaxRankPoints,
    Number(result.rankingleaderboardpos || 0) || null
  );
  const csResolved = resolveCSRank(
    csRankCode,
    csRankPoints,
    csMaxRankCode,
    csPeakPoints,
    null
  );

  const rankInfo = {
    br: {
      ...brResolved,
      show: brRankCode > 0 || brRankPoints > 0,
      rank_code: brRankCode
    },
    cs: {
      ...csResolved,
      show: csRankCode > 0 || csRankPoints > 0,
      rank_code: csRankCode,
      is_ban: csIsBan
    },
    hippo: {
      full_label: null,
      points: Number(rawBasic[67] ?? 0) || null,
      peak: null
    }
  };

  const extendedInfo = {
    season_id: modeSummary.seasonid ?? currentHistory?.ep_event_id ?? null,
    has_elite_pass: currentHistory?.owned_pass ?? false,
    badge_count: currentHistory?.badge_count ?? 0,
    is_prime_member: Boolean(result.primeinfo?.isprime),
    peak_rank_pos: rawBasic[39] ?? null,
    cs_peak_rank_pos: rawBasic[40] ?? null
  };

  return {
    basic_info: result.basicinfo || {},
    profile_info: result.profileinfo || {},
    clan_basic_info: result.clanbasicinfo || null,
    pet_info: result.petinfo || null,
    social_info: socialInfo,
    extended_info: extendedInfo,
    rank_info: rankInfo,
    ranking_leaderboard_pos: result.rankingleaderboardpos || null,
    news: result.news || [],
    history_ep_info: history,
    captain_basic_info: result.captainbasicinfo || null,
    diamond_cost_res: result.diamondcostres || null,
    credit_score_info: creditScoreInfo,
    preveteran_type: result.preveterantype || null,
    pre_veteran_type: result.preveterantype || null,
    mmr_list: result.mmrlist || [],
    mode_stats_summary: modeSummary,
    mode_stats_summary_info: modeSummary,
    diamond_cost: result.diamondcostres?.diamondcost ?? result.diamondcost ?? null,
    gallery_info: result.galleryinfo || null
  };
}

module.exports = {
  loadProtos,
  getPlayerInfo
};
