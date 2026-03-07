export interface LoginOptions {
  selfListen?: boolean;
  listenEvents?: boolean;
  listenTyping?: boolean;
  updatePresence?: boolean;
  forceLogin?: boolean;
  autoMarkDelivery?: boolean;
  autoMarkRead?: boolean;
  autoReconnect?: boolean;
  logRecordSize?: number;
  online?: boolean;
  emitReady?: boolean;
  userAgent?: string;
  pageID?: string;
  proxy?: string;
}

export type LoginCallback = (err: any, client?: any) => void;
