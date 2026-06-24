/**
 * nongtrai v2.2.0 — Thông báo Nông Trại (WSS)
 * Logic xử lý giống ntrai_v6 nhưng loại bỏ tính năng tag/reaction.
 */

import type { Command, CommandOnCallContext, CommandOnLoadContext } from "@types";
import fs from "fs-extra";
import path from "path";
import WebSocket from "ws";
import { getConfig } from "../../../core/configManager";
import log from "../../../utils/log";

const DATA_DIR = path.join(process.cwd(), "storage", "other");
const CONFIG_PATH = path.join(DATA_DIR, "nongtrai_data.json");
const WS_URL = "wss://ptg.subhatde.id.vn";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const WEATHER_MAP: Record<number, { name: string; icon: string }> = {
    1: { name: "Mưa", icon: "🌧" },
    2: { name: "Bão", icon: "⛈" },
    3: { name: "Sương mù", icon: "🌫" },
    4: { name: "Sương sớm", icon: "🌈" },
    7: { name: "Ánh trăng", icon: "🌕" },
    8: { name: "Cực quang", icon: "🌌" },
    9: { name: "Gió", icon: "🌪" },
    10: { name: "Nắng nóng", icon: "☀️" },
    11: { name: "Gió cát", icon: "🪨" }
};

const ITEMS_DB: Record<string, any[]> = {
    "hatgiong": [
        { "id": 90700001, "name": "Hạt cà rốt", "icon": "🥕" },
        { "id": 90700002, "name": "Hạt dâu tây", "icon": "🍓" },
        { "id": 90700003, "name": "Hạt việt quất", "icon": "🫐" },
        { "id": 90700004, "name": "Hạt nấm", "icon": "🍄" },
        { "id": 90700005, "name": "Hạt Bắp", "icon": "🌽" },
        { "id": 90700006, "name": "Hạt cà chua", "icon": "🍅" },
        { "id": 90700007, "name": "Hạt xương rồng", "icon": "🌵" },
        { "id": 90700008, "name": "Hạt táo", "icon": "🍎" },
        { "id": 90700009, "name": "Hạt nho", "icon": "🍇" },
        { "id": 90700011, "name": "Hạt bí ngô", "icon": "🎃" },
        { "id": 90700012, "name": "Hạt dưa hấu", "icon": "🍉" },
        { "id": 90700013, "name": "Hạt xoài", "icon": "🥭" },
        { "id": 90700014, "name": "Hạt dừa", "icon": "🥥" },
        { "id": 90700015, "name": "Hạt khế", "icon": "⭐" },
        { "id": 90700016, "name": "Hạt táo đường", "icon": "🍏" },
        { "id": 90700017, "name": "Hạt cây đậu", "icon": "🫛" },
        { "id": 90700043, "name": "Hạt giống đu đủ", "icon": "🍐" },
        { "id": 90700044, "name": "Hạt giống sung", "icon": "🌳" },
        { "id": 90700045, "name": "Hạt giống mãng cầu", "icon": "🫒" }
    ],
    "congcu": [
        { "id": 90710001, "name": "Vòi tưới thường", "icon": "🚿" },
        { "id": 90710002, "name": "Vòi tưới cao cấp", "icon": "💧" },
        { "id": 90710003, "name": "Vòi tưới siêu cao cấp", "icon": "🌊" },
        { "id": 90710008, "name": "Ống bơm sạch", "icon": "💉" },
        { "id": 90720008, "name": "Bảo vệ trái", "icon": "🛡" },
        { "id": 90720009, "name": "Xẻng bứng cây", "icon": "🪏" },
        { "id": 90720010, "name": "Xẻng", "icon": "⛏️" },
        { "id": 90720015, "name": "Vé tặng quà", "icon": "🎫" }
    ],
    "noithat": [
        { "id": 90750095, "name": "Kho trái cây gỗ", "icon": "🍒" },
        { "id": 90750051, "name": "Vách ngăn cửa nông trại", "icon": "🚪" },
        { "id": 90750065, "name": "Cầu thang bậc rỗng gỗ", "icon": "🪜" },
        { "id": 90750025, "name": "Cờ dây nhiều màu", "icon": "🎏" },
        { "id": 90750010, "name": "Ghế nắng ấm", "icon": "🪑" },
        { "id": 90750062, "name": "Tường gỗ XXL", "icon": "🧱" },
        { "id": 90750068, "name": "Hộp biển giao thông", "icon": "🚦" },
        { "id": 90750106, "name": "Hộp hoàng tử bé", "icon": "🤴" },
        { "id": 90750079, "name": "Hộp ghế sofa cafe", "icon": "☕" },
        { "id": 90750049, "name": "Vách ngăn nông trại A", "icon": "🚪" },
        { "id": 90750057, "name": "Tường gỗ XS", "icon": "🧱" },
        { "id": 90750012, "name": "Ghế lễ hội xiếc", "icon": "🎪" },
        { "id": 90750045, "name": "Đèn sàn", "icon": "💡" },
        { "id": 90750031, "name": "Cối xay gió nông trại", "icon": "🌀" },
        { "id": 90750101, "name": "Hộp tìm kho báu", "icon": "🗺" },
        { "id": 90750098, "name": "Hộp vườn hoa", "icon": "🌸" },
        { "id": 90750076, "name": "Hộp ghế cắm trại", "icon": "🏕" }
    ]
};

interface NongtraiState {
    ws: WebSocket | null;
    pingInterval: NodeJS.Timeout | null;
    reconnectTimeout: NodeJS.Timeout | null;
    lastSentTime: Record<string, number>;
    lastItemsState: Record<string, Record<string, number>>;
    activeThreads: string[];
    client: any;
}

const NOTIFY_INTERVAL = 5 * 60 * 1000;

function getState(): NongtraiState {
    const g = global as any;
    if (!g.__nongtrai_v2_state) {
        g.__nongtrai_v2_state = {
            ws: null,
            pingInterval: null,
            reconnectTimeout: null,
            lastSentTime: { weather: 0, seed: 0, tool: 0, noithat: 0 },
            lastItemsState: { seed: {}, tool: {}, noithat: {} },
            activeThreads: [],
            client: null
        };
    }
    return g.__nongtrai_v2_state;
}

function getItemInfo(id: number) {
    for (const tab of ["hatgiong", "congcu", "noithat"]) {
        const item = ITEMS_DB[tab].find(i => i.id === id);
        if (item) return { name: item.name, icon: item.icon, tab };
    }
    return { name: `#${id}`, icon: "📦", tab: null };
}

async function saveConfig() {
    const st = getState();
    await fs.ensureDir(DATA_DIR);
    await fs.writeJson(CONFIG_PATH, st.activeThreads, { spaces: 2 });
}

async function loadConfig() {
    const st = getState();
    if (await fs.pathExists(CONFIG_PATH)) {
        const data = await fs.readJson(CONFIG_PATH);
        st.activeThreads = Array.isArray(data) ? data.map(String) : [];
    }
}

function stopWs() {
    const st = getState();
    if (st.reconnectTimeout) clearTimeout(st.reconnectTimeout);
    if (st.ws) {
        st.ws.terminate();
        st.ws = null;
    }
    if (st.pingInterval) clearInterval(st.pingInterval);
}

function startWs(api: any) {
    const st = getState();
    st.client = api;
    stopWs();

    log.info("[nongtrai] Connecting WebSocket...");
    const ws = new WebSocket(WS_URL, { headers: { "User-Agent": USER_AGENT }, handshakeTimeout: 15000 });
    st.ws = ws;
    let ready = false;

    ws.on('open', () => {
        log.info("[nongtrai] WebSocket Connected");
        setTimeout(() => { ready = true; }, 3000);
        st.pingInterval = setInterval(() => {
            if (st.ws && st.ws.readyState === WebSocket.OPEN) st.ws.ping();
        }, 30000);
    });

    ws.on('message', (dataStr) => {
        try {
            const json = JSON.parse(dataStr.toString());
            if (!ready || st.activeThreads.length === 0) return;

            let itemsToProcess: any[] = [];
            if (json.items && Array.isArray(json.items)) itemsToProcess = json.items;
            else if (Array.isArray(json)) itemsToProcess = json;

            if (itemsToProcess.length > 0) {
                const grouped: Record<string, any[]> = {};
                itemsToProcess.forEach(item => {
                    const tab = item.tab;
                    if (!tab) return;
                    const key = tab === 'hatgiong' ? 'seed' : tab === 'congcu' ? 'tool' : tab === 'noithat' ? 'noithat' : '';
                    if (!key) return;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push({ id: item.shopItemId?.toString(), qty: item.stock || 0 });
                });

                for (const [type, items] of Object.entries(grouped)) {
                    processPayload(type, items);
                }
            } else if (json.type === 'thoitiet' || (json.event && json.event.type === 'thoitiet')) {
                const wData = json.weather || json.event?.weather;
                if (wData) {
                    const w = WEATHER_MAP[wData.id] || { name: wData.name, icon: wData.icon || "☁️" };
                    processPayload("weather", [{ id: wData.id.toString(), qty: 1, name: w.name, icon: w.icon }]);
                }
            }
        } catch (e) {
            log.error(`[nongtrai] Message error: ${e instanceof Error ? e.message : String(e)}`);
        }
    });

    ws.on('close', () => {
        st.ws = null;
        if (st.activeThreads.length > 0) {
            st.reconnectTimeout = setTimeout(() => startWs(api), 10_000);
        }
    });
}

function processPayload(type: string, items: any[]) {
    const st = getState();
    const now = Date.now();
    let notifyIds: string[] = [];

    if (type === "weather") {
        if (now - st.lastSentTime.weather < 60000) return;
        notifyIds = [items[0].id];
        st.lastSentTime.weather = now;
    } else {
        notifyIds = items
            .filter(item => {
                const prev = st.lastItemsState[type][item.id];
                const isFirst = prev === undefined;
                const isUp = prev === 0 && item.qty > 0;
                return (isFirst && item.qty > 0) || isUp;
            })
            .map(item => item.id);

        items.forEach(item => { st.lastItemsState[type][item.id] = item.qty; });

        if (notifyIds.length === 0) return;
        if (now - st.lastSentTime[type] < NOTIFY_INTERVAL) return;
        st.lastSentTime[type] = now;
    }

    const icon = type === 'seed' ? "🌱" : type === 'tool' ? "🔧" : type === 'noithat' ? "🏠" : "☁️";
    const typeName = type === "seed" ? "Hạt Giống" : type === "tool" ? "Công Cụ" : type === "noithat" ? "Nội Thất" : "Thời Tiết";

    const filteredItems = notifyIds.map(id => {
        const info = type === "weather" ? items[0] : getItemInfo(parseInt(id));
        const item = items.find(i => i.id === id);
        return { ...info, qty: item?.qty || 0 };
    });

    const text = filteredItems.map(i => `- ${i.icon} ${i.name}${type === 'weather' ? '' : `: +${i.qty}`}`).join('\n');
    const display = filteredItems.map(i => i.name).join(", ");
    const body = `[ NÔNG TRẠI ] ${icon} ${typeName} : ${display}\n─────────────────\n${text}`;

    for (const tid of st.activeThreads) {
        st.client.sendMessage(body, tid);
    }
}

const nongtraiCommand: Command = {
    name: "nongtrai",
    alias: ["nt"],
    version: "2.2.0",
    role: 0,
    desc: "Thông báo nông trại Play Together (WSS Singleton)",
    guide: "{pn} on | {pn} off | {pn} status",
    cd: 5,
    prefix: true,

    onLoad: async (ctx: CommandOnLoadContext) => {
        const { client } = ctx;
        const st = getState();
        await loadConfig();
        st.client = client;
        if (st.activeThreads.length > 0) startWs(client);
    },

    onCall: async (ctx: CommandOnCallContext) => {
        const { client, event, args, reply } = ctx;
        const { threadID } = event;
        const st = getState();
        const action = args[0]?.toLowerCase();

        if (action === "on") {
            const tid = String(threadID);
            if (st.activeThreads.includes(tid)) return reply("Box này đang bật rồi.");
            st.activeThreads.push(tid);
            await saveConfig();
            // Reset state để lần đầu on báo hết
            st.lastItemsState = { seed: {}, tool: {}, noithat: {} };
            st.lastSentTime = { weather: 0, seed: 0, tool: 0, noithat: 0 };
            if (!st.ws) startWs(client);
            return reply("✅ Đã BẬT thông báo nông trại.");
        }

        if (action === "off") {
            const tid = String(threadID);
            st.activeThreads = st.activeThreads.filter(id => id !== tid);
            await saveConfig();
            if (st.activeThreads.length === 0) stopWs();
            return reply("❌ Đã TẮT thông báo nông trại.");
        }

        if (action === "status") {
            const isSub = st.activeThreads.includes(String(threadID));
            return reply(`📊 Trạng thái: ${isSub ? "Bật 🟢" : "Tắt 🔴"}\nWebSocket: ${st.ws ? "Đang chạy 🟢" : "Ngắt 🔴"}\nTổng số box: ${st.activeThreads.length}`);
        }

        return reply("Dùng: nt on | off | status");
    }
};

export default nongtraiCommand;
