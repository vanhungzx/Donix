declare module "../../../services/freefire-api/info/index.js" {
  export function getPlayerInfo(
    region: string,
    uid: string,
    needGalleryInfo?: boolean,
    callSignSrc?: number
  ): Promise<Record<string, unknown> | null>;
}

declare module "../../../services/freefire-api/service.js" {
  export function searchAccount(params: { server: string; keyword: string }): Promise<unknown>;
  export function getPlayerStats(params: {
    server: string;
    uid: string;
    gamemode: string;
    matchmode: string;
  }): Promise<Record<string, unknown>>;
  export function getPlayerItems(params: { server: string; uid: string }): Promise<Record<string, unknown> | null>;
}

declare module "../../../services/freefire-api/freefireStatsCanvas.js" {
  export function renderFreeFireStatsCanvas(data: Record<string, unknown>): Buffer;
  export function mapPlayerStatsToCanvasData(
    stats: Record<string, unknown>,
    uid: string,
    server: string,
    matchmode?: string
  ): Record<string, unknown>;
  export function renderFreeFireCSStatsCanvas(data: Record<string, unknown>): Buffer;
  export function mapCSStatsToCanvasData(
    stats: Record<string, unknown>,
    uid: string,
    server: string,
    matchmode?: string
  ): Record<string, unknown>;
}
