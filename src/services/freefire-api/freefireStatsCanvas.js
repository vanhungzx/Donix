/**
 * FREE FIRE STATS — Render canvas từ data { uid, server, mode, SOLO, DUO, SQUAD }
 * Dùng trong a.js (standalone) và ffinfo.js (command stats).
 */
const { createCanvas } = require("canvas");

const COLORS = { SOLO: "#FF7320", DUO: "#B07AFF", SQUAD: "#FFD232" };

const fmt = (n) => Number(n).toLocaleString("en-US");
const shortNum = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
};
const pct = (a, b) => ((a / Math.max(1, b)) * 100).toFixed(1) + "%";
const kd = (k, g, w) => (k / Math.max(1, g - w)).toFixed(2);
const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const R = (n) => Math.round(n);

/**
 * Vẽ ảnh thống kê Free Fire (BR CAREER: SOLO/DUO/SQUAD).
 * @param {Object} data - { uid, server, mode, SOLO, DUO, SQUAD } (mỗi mode: games, wins, kills, deaths, topn, damage, hsk, revives, road, pick, maxk, dist, surv)
 * @returns {Buffer} PNG buffer
 */
function renderFreeFireStatsCanvas(data) {
  const W = 1080;
  const H = 720;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const PAD = 24;
  const INNER = W - PAD * 2;
  const GAP = 18;
  const CW = (INNER - GAP * 2) / 3;
  const CH = 428;
  const HDR_Y = PAD;
  const CARD_Y = HDR_Y + 84;
  const BOT_Y = CARD_Y + CH + 16;
  const FOOT_Y = H - 36;
  const COL_X = [PAD, PAD + CW + GAP, PAD + (CW + GAP) * 2];

  function rrPath(x, y, w, h, r) {
    x = R(x); y = R(y); w = R(w); h = R(h); r = R(r);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function glassCard(x, y, w, h, r = 20, { fillColor = "rgba(255,255,255,0.065)", borderAlpha = 60, accentColor = null, shadow = true } = {}) {
    ctx.save();
    if (shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 4;
    }
    rrPath(x, y, w, h, r);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    rrPath(x, y, w, h, r);
    ctx.clip();
    const gloss = ctx.createLinearGradient(x, y, x, y + h * 0.5);
    gloss.addColorStop(0, "rgba(255,255,255,0.18)"); gloss.addColorStop(0.35, "rgba(255,255,255,0.06)"); gloss.addColorStop(1, "rgba(255,255,255,0.00)");
    ctx.fillStyle = gloss;
    ctx.fillRect(R(x), R(y), R(w), R(h * 0.5));
    ctx.restore();
    ctx.save();
    rrPath(x, y, w, h, r);
    ctx.clip();
    const shade = ctx.createLinearGradient(x, y + h * 0.7, x, y + h);
    shade.addColorStop(0, "rgba(0,0,0,0.00)"); shade.addColorStop(1, "rgba(0,0,8,0.22)");
    ctx.fillStyle = shade;
    ctx.fillRect(R(x), R(y + h * 0.7), R(w), R(h * 0.3));
    ctx.restore();
    rrPath(x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(80, borderAlpha) / 255})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    rrPath(x + 1.5, y + 1.5, w - 3, h - 3, r - 1);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.stroke();
    if (accentColor) {
      const [ar, ag, ab] = accentColor;
      ctx.save();
      rrPath(x, y, w, h, r);
      ctx.clip();
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.55)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(R(x + r), R(y + 1.5));
      ctx.lineTo(R(x + w - r), R(y + 1.5));
      ctx.stroke();
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.12)`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(R(x + r), R(y + 4));
      ctx.lineTo(R(x + w - r), R(y + 4));
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function txt(str, x, y, font, color, align = "left") {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(str), R(x), R(y));
    ctx.restore();
  }

  function drawRadar(cx, cy, radius, values, hexColor, labels = null) {
    const [r, g, b] = rgb(hexColor);
    const axes = values.length;
    const step = (Math.PI * 2) / axes;
    const start = -Math.PI / 2;
    const labelDist = radius * 1.12;
    [0.25, 0.5, 0.75, 1.0].forEach((ring) => {
      ctx.beginPath();
      for (let i = 0; i < axes; i++) {
        const a = start + i * step;
        const rr = radius * ring;
        const px = cx + rr * Math.cos(a);
        const py = cy + rr * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${r},${g},${b},0.16)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    for (let i = 0; i < axes; i++) {
      const a = start + i * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const clamp = (v) => Math.min(1, Math.max(0.08, v));
    const pts = values.map((v, i) => {
      const a = start + i * step;
      const rr = radius * clamp(v);
      return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    });
    ctx.save();
    ctx.filter = "blur(7px)";
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.30)`;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    rg.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
    rg.addColorStop(1, `rgba(${r},${g},${b},0.10)`);
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.strokeStyle = hexColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    pts.forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},0.30)`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = hexColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
    });
    if (labels && labels.length === axes) {
      labels.forEach((label, i) => {
        const a = start + i * step;
        const lx = cx + labelDist * Math.cos(a);
        const ly = cy + labelDist * Math.sin(a);
        ctx.save();
        ctx.font = "9px Carlito, DejaVu Sans";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = Math.abs(Math.cos(a)) < 0.4 ? "center" : Math.cos(a) > 0 ? "left" : "right";
        ctx.textBaseline = "middle";
        ctx.fillText(label, R(lx), R(ly));
        ctx.restore();
      });
    }
  }

  function statPill(x, y, w, h, label, value, hexColor, valueSize = 15) {
    const [r, g, b] = rgb(hexColor);
    glassCard(x, y, w, h, 12, { fillColor: `rgba(${r},${g},${b},0.13)`, borderAlpha: 42, shadow: false });
    const cxx = x + w / 2;
    txt(label, cxx, y + 18, "10px Carlito, DejaVu Sans", "#B8B0D0", "center");
    txt(value, cxx, y + 42, `bold ${valueSize}px Carlito, DejaVu Sans`, "#FFFFFF", "center");
  }

  function drawBG() {
    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, "#070412");
    base.addColorStop(0.5, "#0A091C");
    base.addColorStop(1, "#060312");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    const blobs = [
      { x: 160, y: 220, rx: 320, ry: 270, c: "rgba(75,35,190,0.28)" },
      { x: 600, y: 95, rx: 260, ry: 190, c: "rgba(190,50,110,0.22)" },
      { x: 910, y: 340, rx: 290, ry: 250, c: "rgba(35,110,210,0.22)" },
      { x: 260, y: 570, rx: 300, ry: 210, c: "rgba(50,180,160,0.18)" },
      { x: 790, y: 585, rx: 260, ry: 190, c: "rgba(160,60,240,0.20)" },
    ];
    blobs.forEach(({ x, y, rx, ry, c }) => {
      ctx.save();
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(x, y * (rx / ry), 0, x, y * (rx / ry), rx);
      g.addColorStop(0, c);
      g.addColorStop(0.65, c.replace(/[\d.]+\)$/, "0.05)"));
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y * (rx / ry), rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    const v = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, Math.max(W, H) / 1.1);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    for (let i = 0; i < 1200; i++) {
      ctx.fillRect(R(Math.random() * W), R(Math.random() * H), 1, 1);
    }
  }

  const DATA = data;
  drawBG();
  glassCard(PAD, HDR_Y, INNER, 68, 31, { fillColor: "rgba(150,120,255,0.08)", borderAlpha: 48, accentColor: [255, 215, 60] });
  txt("FREE FIRE STATS", PAD + 16, 46, "bold 23px Carlito, DejaVu Sans", "#FFD23C");
  txt(`UID: ${DATA.uid}  •  Server: ${DATA.server}  •  Mode: ${DATA.mode}`, PAD + 16, 66, "12.5px Carlito, DejaVu Sans", "#D8D0E8");
  txt("SỐ HẠNG SINH TỒN", W / 2, CARD_Y - 10, "bold 11px Carlito, DejaVu Sans", "#C4B0E8", "center");
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, CARD_Y - 2);
  ctx.lineTo(W - PAD, CARD_Y - 2);
  ctx.stroke();

  ["SOLO", "DUO", "SQUAD"].forEach((mode, i) => {
    const sd = DATA[mode];
    if (!sd) return;
    const col = COLORS[mode];
    const [cr, cg, cb] = rgb(col);
    const cx = COL_X[i];
    const cy = CARD_Y;
    glassCard(cx, cy, CW, CH, 22, { fillColor: `rgba(${cr},${cg},${cb},0.06)`, borderAlpha: 45, accentColor: [cr, cg, cb] });
    glassCard(cx + 14, cy + 14, 98, 32, 16, { fillColor: `rgba(${cr},${cg},${cb},0.32)`, borderAlpha: 55, shadow: false });
    txt(mode, cx + 14 + 49, cy + 14 + 21, "bold 14px Carlito, DejaVu Sans", "#FFFFFF", "center");
    const radarCy = cy + 56 + 14 + 78;
    const radarR = 78;
    const radarVals = [
      Math.min(1, (sd.damage || 0) / 6e6),
      Math.min(1, (sd.kills || 0) / 12000),
      Math.min(1, (sd.topn || 0) / 3000),
      Math.min(1, parseFloat(kd(sd.kills || 0, sd.games || 1, sd.wins || 0)) / 5),
      Math.min(1, ((sd.hsk || 0) / Math.max(1, sd.kills || 0)) * 1.8),
    ];
    drawRadar(cx + CW / 2, radarCy, radarR, radarVals, col, ["DMG %", "KILL %", "TOP %", "K/D", "HS%"]);
    const M = 20;
    const row1Y = cy + 56 + 14 + radarR * 2 + 18;
    const pillGap = 10;
    const pillW3 = (CW - M * 2 - pillGap * 2) / 3;
    [["SỐ TRẬN", fmt(sd.games || 0)], ["THẮNG", fmt(sd.wins || 0)], ["HẠNG TOP", fmt(sd.topn || 0)]].forEach(([lbl, val], k) => {
      statPill(cx + M + k * (pillW3 + pillGap), row1Y, pillW3, 56, lbl, val, col, 15);
    });
    const row2Y = row1Y + 56 + 14;
    const pillW2 = (CW - M * 2 - pillGap) / 2;
    [["Win%", pct(sd.wins || 0, sd.games || 1)], ["K/D", kd(sd.kills || 0, sd.games || 1, sd.wins || 0)]].forEach(([lbl, val], k) => {
      const bx = cx + M + k * (pillW2 + pillGap);
      glassCard(bx, row2Y, pillW2, 50, 12, { fillColor: `rgba(${cr},${cg},${cb},0.14)`, borderAlpha: 50, accentColor: [cr, cg, cb], shadow: false });
      txt(lbl, bx + 12, row2Y + 18, "10px Carlito, DejaVu Sans", "#B8B0D0");
      txt(val, bx + 12, row2Y + 40, "bold 16px Carlito, DejaVu Sans", col);
    });
    const row3Y = row2Y + 50 + 14;
    glassCard(cx + M, row3Y, CW - M * 2, 44, 10, { fillColor: "rgba(255,255,255,0.06)", borderAlpha: 35, shadow: false });
    const segW = (CW - M * 2) / 3;
    [["Deaths", fmt(sd.deaths || 0)], ["Top N", fmt(sd.topn || 0)], ["Max Kills", fmt(sd.maxk || 0)]].forEach(([lbl, val], k) => {
      const sx = cx + M + k * segW + 14;
      txt(lbl, sx, row3Y + 18, "10px Carlito, DejaVu Sans", "#E0E0E0");
      txt(val, sx, row3Y + 36, "bold 12px Carlito, DejaVu Sans", "#FFFFFF");
    });
  });

  glassCard(PAD, BOT_Y, INNER, 116, 22, { fillColor: "rgba(110,72,250,0.07)", borderAlpha: 45, accentColor: [155, 85, 255] });
  txt("SQUAD — THỐNG KÊ NỔI BẬT", PAD + 16, BOT_Y + 22, "bold 13px Carlito, DejaVu Sans", "#E0D8F0");
  const sq = DATA.SQUAD || {};
  const hiItems = [
    ["Total Damage", shortNum(sq.damage || 0)],
    ["Distance (m)", shortNum(sq.dist || 0)],
    ["Survival (s)", shortNum(sq.surv || 0)],
    ["HS Kills", shortNum(sq.hsk || 0)],
    ["Pickups", shortNum(sq.pick || 0)],
    ["Knockdowns", shortNum(sq.road || 0)],
  ];
  const slotW = INNER / 6;
  hiItems.forEach(([lbl, val], i) => {
    const cxx = PAD + (i + 0.5) * slotW;
    const y = BOT_Y + 34;
    if (i > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(R(PAD + i * slotW), R(y + 6));
      ctx.lineTo(R(PAD + i * slotW), R(y + 78));
      ctx.stroke();
    }
    txt(lbl, cxx, y + 18, "10px Carlito, DejaVu Sans", "#B8B0D0", "center");
    txt(val, cxx, y + 46, "bold 20px Carlito, DejaVu Sans", "#FFD232", "center");
  });

  glassCard(PAD, FOOT_Y, INNER, 28, 14, { fillColor: "rgba(255,255,255,0.038)", borderAlpha: 26, shadow: false });
  txt(`Free Fire Stats Generator  •  UID: ${DATA.uid}  •  Server: ${DATA.server}`, PAD + 14, FOOT_Y + 18, "10px Carlito, DejaVu Sans", "#A098C8");
  txt("Powered by Node Canvas", W - PAD - 14, FOOT_Y + 18, "10px Carlito, DejaVu Sans", "#D4B848", "right");

  return canvas.toBuffer("image/png");
}

/**
 * Map API getPlayerStats (BR) response sang format DATA cho renderFreeFireStatsCanvas.
 * data: { solostats, duostats, quadstats } (proto decode)
 */
function mapPlayerStatsToCanvasData(apiData, uid, server, matchmode = "CAREER") {
  const nu = (v) => (v != null && v !== undefined ? Number(v) : 0);
  const mapMode = (raw) => {
    if (!raw) return { games: 0, wins: 0, kills: 0, deaths: 0, topn: 0, damage: 0, hsk: 0, revives: 0, road: 0, pick: 0, maxk: 0, dist: 0, surv: 0 };
    const d = raw.detailedstats || raw.detailedStats || {};
    return {
      games: nu(raw.gamesplayed ?? raw.gamesPlayed),
      wins: nu(raw.wins),
      kills: nu(raw.kills),
      deaths: nu(d.deaths),
      topn: nu(d.topntimes ?? d.topnTimes ?? d.top10times ?? d.top10Times ?? 0),
      damage: nu(d.damage),
      hsk: nu(d.headshotkills ?? d.headshotKills ?? d.headshots ?? 0),
      revives: nu(d.revives),
      road: nu(d.knockdown ?? d.roadkills ?? d.roadKills ?? 0),
      pick: nu(d.pickups),
      maxk: nu(d.highestkills ?? d.highestKills),
      dist: nu(d.distancetravelled ?? d.distanceTravelled),
      surv: nu(d.survivaltime ?? d.survivalTime),
    };
  };
  return {
    uid: String(uid),
    server: String(server || "VN"),
    mode: `BR — ${matchmode || "CAREER"}`,
    SOLO: mapMode(apiData.solostats ?? apiData.soloStats),
    DUO: mapMode(apiData.duostats ?? apiData.duoStats),
    SQUAD: mapMode(apiData.quadstats ?? apiData.quadStats),
  };
}

/**
 * Map API getPlayerStats (CS - Clash Squad) response sang format cho renderFreeFireCSStatsCanvas.
 * data: { csstats } với gamesplayed, wins, kills, detailedstats (mvpcount, damage, headshotkills, knockdowns, revivals, assists, deaths, ...)
 */
function mapCSStatsToCanvasData(apiData, uid, server, matchmode = "CAREER") {
  const nu = (v) => {
    if (v == null || v === undefined) return 0;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    const s = String(v).trim();
    if (!s) return 0;
    return Number(s.replace(/\./g, "")) || 0;
  };
  const raw = apiData.csstats ?? apiData.csStats ?? {};
  const d = raw.detailedstats ?? raw.detailedStats ?? {};
  const games = nu(raw.gamesplayed ?? raw.gamesPlayed);
  const wins = nu(raw.wins);
  const kills = nu(raw.kills);
  const deaths = nu(d.deaths);
  return {
    uid: String(uid),
    server: String(server || "VN"),
    mode: `CS — ${matchmode || "CAREER"}`,
    games,
    wins,
    kills,
    deaths,
    mvp: nu(d.mvpcount ?? d.mvpCount),
    damage: nu(d.damage),
    hsk: nu(d.headshotkills ?? d.headshotKills),
    knockdowns: nu(d.knockdowns),
    revivals: nu(d.revivals),
    assists: nu(d.assists),
    doublekills: nu(d.doublekills ?? d.doubleKills),
    triplekills: nu(d.triplekills ?? d.tripleKills),
    fourkills: nu(d.fourkills ?? d.fourKills),
  };
}

const CS_ACCENT = "#B07AFF";

/**
 * Vẽ ảnh thống kê Clash Squad (1 card, cùng style glass).
 * data: { uid, server, mode, games, wins, kills, deaths, mvp, damage, hsk, knockdowns, revivals, assists, doublekills, triplekills, fourkills }
 */
function renderFreeFireCSStatsCanvas(data) {
  const W = 1080;
  const H = 560;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const PAD = 24;
  const INNER = W - PAD * 2;
  const HDR_Y = PAD;
  const CARD_Y = HDR_Y + 84;
  const FOOT_Y = H - 36;
  const [cr, cg, cb] = rgb(CS_ACCENT);

  function rrPath(x, y, w, h, r) {
    x = R(x); y = R(y); w = R(w); h = R(h); r = R(r);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function glassCard(x, y, w, h, r = 20, { fillColor = "rgba(255,255,255,0.065)", borderAlpha = 60, accentColor = null, shadow = true } = {}) {
    ctx.save();
    if (shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 4;
    }
    rrPath(x, y, w, h, r);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    rrPath(x, y, w, h, r);
    ctx.clip();
    const gloss = ctx.createLinearGradient(x, y, x, y + h * 0.5);
    gloss.addColorStop(0, "rgba(255,255,255,0.18)"); gloss.addColorStop(0.35, "rgba(255,255,255,0.06)"); gloss.addColorStop(1, "rgba(255,255,255,0.00)");
    ctx.fillStyle = gloss;
    ctx.fillRect(R(x), R(y), R(w), R(h * 0.5));
    ctx.restore();
    rrPath(x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(80, borderAlpha) / 255})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (accentColor) {
      const [ar, ag, ab] = accentColor;
      ctx.save();
      rrPath(x, y, w, h, r);
      ctx.clip();
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.55)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(R(x + r), R(y + 1.5));
      ctx.lineTo(R(x + w - r), R(y + 1.5));
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function txt(str, x, y, font, color, align = "left") {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(str), R(x), R(y));
    ctx.restore();
  }

  function drawRadar(cx, cy, radius, values, hexColor, labels = null) {
    const [r, g, b] = rgb(hexColor);
    const axes = values.length;
    const step = (Math.PI * 2) / axes;
    const start = -Math.PI / 2;
    const labelDist = radius * 1.12;
    [0.25, 0.5, 0.75, 1.0].forEach((ring) => {
      ctx.beginPath();
      for (let i = 0; i < axes; i++) {
        const a = start + i * step;
        const rr = radius * ring;
        const px = cx + rr * Math.cos(a);
        const py = cy + rr * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${r},${g},${b},0.16)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    for (let i = 0; i < axes; i++) {
      const a = start + i * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const clamp = (v) => Math.min(1, Math.max(0.08, v));
    const pts = values.map((v, i) => {
      const a = start + i * step;
      const rr = radius * clamp(v);
      return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    });
    ctx.save();
    ctx.filter = "blur(7px)";
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.30)`;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    rg.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
    rg.addColorStop(1, `rgba(${r},${g},${b},0.10)`);
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.strokeStyle = hexColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    pts.forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},0.30)`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = hexColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
    });
    if (labels && labels.length === axes) {
      labels.forEach((label, i) => {
        const a = start + i * step;
        const lx = cx + labelDist * Math.cos(a);
        const ly = cy + labelDist * Math.sin(a);
        ctx.save();
        ctx.font = "9px Carlito, DejaVu Sans";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = Math.abs(Math.cos(a)) < 0.4 ? "center" : Math.cos(a) > 0 ? "left" : "right";
        ctx.textBaseline = "middle";
        ctx.fillText(label, R(lx), R(ly));
        ctx.restore();
      });
    }
  }

  // BG
  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, "#070412");
  base.addColorStop(0.5, "#0A091C");
  base.addColorStop(1, "#060312");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, Math.max(W, H) / 1.1);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  // Header
  glassCard(PAD, HDR_Y, INNER, 68, 31, { fillColor: "rgba(110,72,250,0.08)", borderAlpha: 48, accentColor: [cr, cg, cb] });
  txt("FREE FIRE STATS", PAD + 16, 46, "bold 23px Carlito, DejaVu Sans", "#E0B0FF");
  txt(`UID: ${data.uid}  •  Server: ${data.server}  •  Mode: ${data.mode}`, PAD + 16, 66, "12.5px Carlito, DejaVu Sans", "#D8D0E8");

  txt("SỐ HẠNG KỸ NĂNG CHIẾN — CLASH SQUAD", W / 2, CARD_Y - 10, "bold 11px Carlito, DejaVu Sans", "#C4B0E8", "center");
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, CARD_Y - 2);
  ctx.lineTo(W - PAD, CARD_Y - 2);
  ctx.stroke();

  const cardH = 340;
  glassCard(PAD, CARD_Y, INNER, cardH, 22, { fillColor: `rgba(${cr},${cg},${cb},0.06)`, borderAlpha: 45, accentColor: [cr, cg, cb] });

  // Radar CS: KILL, WIN%, K/D, DMG%, HS%
  const radarR = 72;
  const radarCy = CARD_Y + 24 + radarR;
  const radarCx = W / 2;
  const g = data.games || 1;
  const radarVals = [
    Math.min(1, (data.kills || 0) / 25000),
    Math.min(1, ((data.wins || 0) / g) / 0.7),
    Math.min(1, (data.kills || 0) / Math.max(1, data.deaths || 1) / 3),
    Math.min(1, (data.damage || 0) / 1e7),
    Math.min(1, ((data.hsk || 0) / Math.max(1, data.kills || 1)) * 2),
  ];
  drawRadar(radarCx, radarCy, radarR, radarVals, CS_ACCENT, ["KILL", "WIN %", "K/D", "DMG %", "HS %"]);

  const M = 20;
  const row1Y = CARD_Y + 24 + radarR * 2 + 14;
  const pillW = (INNER - M * 2 - 12 * 3) / 4;
  const row1 = [
    ["SỐ TRẬN", fmt(data.games || 0)],
    ["THẮNG", fmt(data.wins || 0)],
    ["KILLS", fmt(data.kills || 0)],
    ["K/D", (data.kills / Math.max(1, (data.deaths || 0))).toFixed(2)],
  ];
  row1.forEach(([lbl, val], k) => {
    const x = PAD + M + k * (pillW + 12);
    glassCard(x, row1Y, pillW, 52, 12, { fillColor: `rgba(${cr},${cg},${cb},0.14)`, borderAlpha: 50, shadow: false });
    txt(lbl, x + pillW / 2, row1Y + 18, "10px Carlito, DejaVu Sans", "#B8B0D0", "center");
    txt(val, x + pillW / 2, row1Y + 42, "bold 16px Carlito, DejaVu Sans", CS_ACCENT, "center");
  });

  const row2Y = row1Y + 52 + 16;
  const segW = (INNER - M * 2) / 4;
  const row2 = [
    ["Damage", shortNum(data.damage || 0)],
    ["MVP", fmt(data.mvp || 0)],
    ["HS Kills", fmt(data.hsk || 0)],
    ["Knockdowns", fmt(data.knockdowns || 0)],
  ];
  row2.forEach(([lbl, val], k) => {
    const x = PAD + M + k * segW + segW / 2;
    txt(lbl, x, row2Y + 14, "10px Carlito, DejaVu Sans", "#B8B0D0", "center");
    txt(val, x, row2Y + 34, "bold 14px Carlito, DejaVu Sans", "#FFFFFF", "center");
  });

  const row3Y = row2Y + 52;
  const row3 = [
    ["Revivals", fmt(data.revivals || 0)],
    ["Assists", fmt(data.assists || 0)],
    ["Deaths", fmt(data.deaths || 0)],
    ["2K/3K/4K", `${data.doublekills || 0} / ${data.triplekills || 0} / ${data.fourkills || 0}`],
  ];
  row3.forEach(([lbl, val], k) => {
    const x = PAD + M + k * segW + segW / 2;
    txt(lbl, x, row3Y + 14, "10px Carlito, DejaVu Sans", "#E0E0E0", "center");
    txt(val, x, row3Y + 34, "bold 12px Carlito, DejaVu Sans", "#FFFFFF", "center");
  });

  glassCard(PAD, FOOT_Y, INNER, 28, 14, { fillColor: "rgba(255,255,255,0.038)", borderAlpha: 26, shadow: false });
  txt(`Free Fire Stats  •  UID: ${data.uid}  •  Server: ${data.server}`, PAD + 14, FOOT_Y + 18, "10px Carlito, DejaVu Sans", "#A098C8");
  txt("Powered by Node Canvas", W - PAD - 14, FOOT_Y + 18, "10px Carlito, DejaVu Sans", "#D4B848", "right");

  return canvas.toBuffer("image/png");
}

module.exports = {
  renderFreeFireStatsCanvas,
  mapPlayerStatsToCanvasData,
  mapCSStatsToCanvasData,
  renderFreeFireCSStatsCanvas
};
