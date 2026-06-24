type StatsCanvasData = Record<string, unknown>;

type CanvasModule = {
  renderFreeFireStatsCanvas(data: StatsCanvasData): Buffer;
  mapPlayerStatsToCanvasData(apiData: Record<string, unknown>, uid: string, server: string, matchmode?: string): StatsCanvasData;
  mapCSStatsToCanvasData(apiData: Record<string, unknown>, uid: string, server: string, matchmode?: string): StatsCanvasData;
  renderFreeFireCSStatsCanvas(data: StatsCanvasData): Buffer;
};

const mod = require("./freefireStatsCanvas.js") as CanvasModule;

export const renderFreeFireStatsCanvas = mod.renderFreeFireStatsCanvas;
export const mapPlayerStatsToCanvasData = mod.mapPlayerStatsToCanvasData;
export const mapCSStatsToCanvasData = mod.mapCSStatsToCanvasData;
export const renderFreeFireCSStatsCanvas = mod.renderFreeFireCSStatsCanvas;
export default mod;
