/**
 * Rank helper for Free Fire BR/CS.
 */

const BR_TIERS = {
  0: { name: "Unranked", badge: "rank_unranked", color: "#9e9e9e" },
  1: { name: "Bronze", badge: "rank_bronze", color: "#cd7f32" },
  2: { name: "Silver", badge: "rank_silver", color: "#a8a9ad" },
  3: { name: "Gold", badge: "rank_gold", color: "#ffd700" },
  4: { name: "Platinum", badge: "rank_platinum", color: "#00bcd4" },
  5: { name: "Diamond", badge: "rank_diamond", color: "#b9f2ff" },
  6: { name: "Heroic", badge: "rank_heroic", color: "#ff6b35" },
  7: { name: "Grandmaster", badge: "rank_grandmaster", color: "#e040fb" }
};

const CS_TIERS = {
  0: { name: "Unranked", badge: "cs_rank_unranked", color: "#9e9e9e" },
  1: { name: "Bronze", badge: "cs_rank_bronze", color: "#cd7f32" },
  2: { name: "Silver", badge: "cs_rank_silver", color: "#a8a9ad" },
  3: { name: "Gold", badge: "cs_rank_gold", color: "#ffd700" },
  4: { name: "Platinum", badge: "cs_rank_platinum", color: "#00bcd4" },
  5: { name: "Diamond", badge: "cs_rank_diamond", color: "#b9f2ff" },
  6: { name: "Master", badge: "cs_rank_master", color: "#ff6b35" },
  7: { name: "Grandmaster", badge: "cs_rank_grandmaster", color: "#e040fb" }
};

const BR_RANK_DISPLAY = {
  BRONZE: { badge: "rank_bronze", color: "#cd7f32" },
  SILVER: { badge: "rank_silver", color: "#a8a9ad" },
  GOLD: { badge: "rank_gold", color: "#ffd700" },
  PLATINUM: { badge: "rank_platinum", color: "#00bcd4" },
  DIAMOND: { badge: "rank_diamond", color: "#b9f2ff" },
  HEROIC: { badge: "rank_heroic", color: "#ff6b35" },
  SUPER_HEROIC: { badge: "rank_heroic", color: "#ff6b35" },
  MASTER: { badge: "rank_heroic", color: "#ff6b35" },
  GRANDMASTER: { badge: "rank_grandmaster", color: "#e040fb" },
  CHALLENGER: { badge: "rank_grandmaster", color: "#e040fb" }
};

const CS_RANK_DISPLAY = {
  BRONZE: { badge: "cs_rank_bronze", color: "#cd7f32" },
  SILVER: { badge: "cs_rank_silver", color: "#a8a9ad" },
  GOLD: { badge: "cs_rank_gold", color: "#ffd700" },
  PLATINUM: { badge: "cs_rank_platinum", color: "#00bcd4" },
  DIAMOND: { badge: "cs_rank_diamond", color: "#b9f2ff" },
  HEROIC: { badge: "cs_rank_master", color: "#ff6b35" },
  SUPER_HEROIC: { badge: "cs_rank_master", color: "#ff6b35" },
  MASTER: { badge: "cs_rank_master", color: "#ff6b35" },
  GRANDMASTER: { badge: "cs_rank_grandmaster", color: "#e040fb" },
  CHALLENGER: { badge: "cs_rank_grandmaster", color: "#e040fb" }
};

function calculateBRRankByPoints(totalPoints, serverRank = null, challengerLimit = 7000) {
  const p = Number(totalPoints) || 0;
  const ranges = [
    { min: 0, name: "Đồng", key: "BRONZE", tier: null, isElite: false },
    { min: 1300, name: "Bạc", key: "SILVER", tier: 1, isElite: false },
    { min: 1400, name: "Bạc", key: "SILVER", tier: 2, isElite: false },
    { min: 1500, name: "Bạc", key: "SILVER", tier: 3, isElite: false },
    { min: 1600, name: "Vàng", key: "GOLD", tier: 1, isElite: false },
    { min: 1725, name: "Vàng", key: "GOLD", tier: 2, isElite: false },
    { min: 1850, name: "Vàng", key: "GOLD", tier: 3, isElite: false },
    { min: 1975, name: "Vàng", key: "GOLD", tier: 4, isElite: false },
    { min: 2100, name: "Bạch Kim", key: "PLATINUM", tier: 1, isElite: false },
    { min: 2225, name: "Bạch Kim", key: "PLATINUM", tier: 2, isElite: false },
    { min: 2350, name: "Bạch Kim", key: "PLATINUM", tier: 3, isElite: false },
    { min: 2475, name: "Bạch Kim", key: "PLATINUM", tier: 4, isElite: false },
    { min: 2600, name: "Bạch Kim", key: "PLATINUM", tier: 5, isElite: false },
    { min: 2750, name: "Kim Cương", key: "DIAMOND", tier: 1, isElite: false },
    { min: 2900, name: "Kim Cương", key: "DIAMOND", tier: 2, isElite: false },
    { min: 3050, name: "Kim Cương", key: "DIAMOND", tier: 3, isElite: false },
    { min: 3200, name: "Kim Cương", key: "DIAMOND", tier: 4, isElite: false },
    { min: 3350, name: "Kim Cương", key: "DIAMOND", tier: 5, isElite: false },
    { min: 3500, name: "Huyền Thoại", key: "HEROIC", tier: null, isElite: true },
    { min: 5500, name: "Siêu Huyền Thoại", key: "SUPER_HEROIC", tier: null, isElite: true },
    { min: 6300, name: "Cao Thủ", key: "MASTER", tier: null, isElite: true },
    { min: 9000, name: "Đại Cao Thủ", key: "GRANDMASTER", tier: null, isElite: true }
  ];

  let current = ranges[0];
  for (const r of ranges) {
    if (p >= r.min) current = r;
    else break;
  }

  let rankName = current.name;
  let rankKey = current.key;
  if (serverRank != null && serverRank > 0 && serverRank <= challengerLimit && p >= 6300) {
    rankName = "Thách Đấu";
    rankKey = "CHALLENGER";
  }

  return {
    rankName,
    rankKey,
    tier: current.tier,
    isElite: current.isElite || rankName === "Thách Đấu"
  };
}

function getRankCS(points) {
  const p = Number.parseInt(String(points || 0), 10) || 0;
  if (p < 3) return { rankName: "Đồng", tier: 1, stars: p, maxStars: 3, isElite: false };
  if (p < 6) return { rankName: "Đồng", tier: 2, stars: p - 3, maxStars: 3, isElite: false };
  if (p < 9) return { rankName: "Đồng", tier: 3, stars: p - 6, maxStars: 3, isElite: false };
  if (p < 13) return { rankName: "Bạc", tier: 1, stars: p - 9, maxStars: 4, isElite: false };
  if (p < 17) return { rankName: "Bạc", tier: 2, stars: p - 12, maxStars: 4, isElite: false };
  if (p < 21) return { rankName: "Bạc", tier: 3, stars: p - 16, maxStars: 4, isElite: false };
  if (p < 25) return { rankName: "Vàng", tier: 1, stars: p - 21, maxStars: 4, isElite: false };
  if (p < 29) return { rankName: "Vàng", tier: 2, stars: p - 25, maxStars: 4, isElite: false };
  if (p < 33) return { rankName: "Vàng", tier: 3, stars: p - 29, maxStars: 4, isElite: false };
  if (p < 37) return { rankName: "Vàng", tier: 4, stars: p - 33, maxStars: 4, isElite: false };
  if (p < 42) return { rankName: "Bạch Kim", tier: 1, stars: p - 37, maxStars: 5, isElite: false };
  if (p < 47) return { rankName: "Bạch Kim", tier: 2, stars: p - 42, maxStars: 5, isElite: false };
  if (p < 52) return { rankName: "Bạch Kim", tier: 3, stars: p - 47, maxStars: 5, isElite: false };
  if (p < 57) return { rankName: "Bạch Kim", tier: 4, stars: p - 52, maxStars: 5, isElite: false };
  if (p < 62) return { rankName: "Bạch Kim", tier: 5, stars: p - 57, maxStars: 5, isElite: false };
  if (p < 67) return { rankName: "Kim Cương", tier: 1, stars: p - 62, maxStars: 5, isElite: false };
  if (p < 72) return { rankName: "Kim Cương", tier: 2, stars: p - 67, maxStars: 5, isElite: false };
  if (p < 77) return { rankName: "Kim Cương", tier: 3, stars: p - 72, maxStars: 5, isElite: false };
  if (p < 82) return { rankName: "Kim Cương", tier: 4, stars: p - 77, maxStars: 5, isElite: false };
  if (p < 87) return { rankName: "Kim Cương", tier: 5, stars: p - 82, maxStars: 5, isElite: false };
  // CS hiện hiển thị Heroic theo sao tích lũy (không tách Super/Master/GM theo mốc điểm như BR)
  return { rankName: "Huyền Thoại", tier: null, stars: Math.max(1, p - 87), maxStars: null, isElite: true };
}

function resolveBRRank(rankId = 0, points = 0, maxRankId = 0, maxPoints = 0, serverRank = null) {
  const byPoints = calculateBRRankByPoints(points, serverRank);
  const baseTier = BR_TIERS[rankId] || null;
  const display = BR_RANK_DISPLAY[byPoints.rankKey] || BR_RANK_DISPLAY.HEROIC;
  const peakTier = BR_TIERS[maxRankId] || null;
  const roman = ["I", "II", "III", "IV", "V"];
  const division = byPoints.tier != null ? (roman[byPoints.tier - 1] || "") : "";
  const fullLabel =
    `${byPoints.rankName}${division ? ` ${division}` : ""} - ${Number(points) || 0} điểm` +
    (serverRank ? ` (Top ${serverRank})` : "");

  return {
    tier_id: rankId,
    tier_name: byPoints.rankName,
    tier_badge: baseTier ? baseTier.badge : display.badge,
    tier_color: baseTier ? baseTier.color : display.color,
    division,
    full_label: fullLabel,
    points: Number(points) || 0,
    current_stars: null,
    max_stars: null,
    is_elite: byPoints.isElite,
    rank_name: byPoints.rankName,
    rank_key: byPoints.rankKey,
    ...(serverRank ? { server_rank: serverRank } : {}),
    peak: peakTier
      ? {
        tier_id: maxRankId,
        tier_name: peakTier.name,
        tier_badge: peakTier.badge,
        tier_color: peakTier.color,
        division: "",
        full_label: peakTier.name,
        points: Number(maxPoints) || 0
      }
      : null
  };
}

function resolveCSRank(rankId = 0, points = 0, maxRankId = 0, peakPoints = 0, serverRank = null) {
  const byPoints = getRankCS(points);
  const isChallenger = serverRank === 1;
  const rankName = isChallenger ? "Thách Đấu" : byPoints.rankName;
  const rankKey = isChallenger
    ? "CHALLENGER"
    : byPoints.rankName === "Đại Cao Thủ"
      ? "GRANDMASTER"
      : byPoints.rankName === "Cao Thủ"
        ? "MASTER"
        : byPoints.rankName === "Siêu Huyền Thoại"
          ? "SUPER_HEROIC"
          : "HEROIC";
  const baseTier = CS_TIERS[rankId] || null;
  const display = CS_RANK_DISPLAY[rankKey] || CS_RANK_DISPLAY.HEROIC;
  const peakTier = CS_TIERS[maxRankId] || null;
  const roman = ["I", "II", "III", "IV", "V"];
  const division = byPoints.tier != null ? (roman[byPoints.tier - 1] || "") : "";
  const fullLabel =
    `${rankName}${division ? ` ${division}` : ""} - ${byPoints.stars} sao` +
    (serverRank ? ` (Top ${serverRank})` : "");

  return {
    tier_id: rankId,
    tier_name: rankName,
    tier_badge: baseTier ? baseTier.badge : display.badge,
    tier_color: baseTier ? baseTier.color : display.color,
    division,
    full_label: fullLabel,
    points: Number(points) || 0,
    current_stars: byPoints.stars,
    max_stars: byPoints.maxStars,
    is_elite: byPoints.isElite,
    rank_name: rankName,
    rank_key: rankKey,
    ...(serverRank ? { server_rank: serverRank } : {}),
    peak: peakTier
      ? {
        tier_id: maxRankId,
        tier_name: peakTier.name,
        tier_badge: peakTier.badge,
        tier_color: peakTier.color,
        division: "",
        full_label: peakTier.name,
        peak_points: Number(peakPoints) || 0
      }
      : null
  };
}

module.exports = {
  BR_TIERS,
  CS_TIERS,
  getRankCS,
  calculateBRRankByPoints,
  resolveBRRank,
  resolveCSRank
};
