interface LegacyPresence {
  la?: number;
  a?: unknown;
}

interface ProxyPresenceShape {
  lat?: number;
  p?: unknown;
}

export interface FormattedPresence {
  type: "presence";
  timestamp: number;
  userID: string;
  statuses: unknown;
}

export const formatPresence = (presence: unknown, userID: string): FormattedPresence => {
  const p = presence as LegacyPresence;
  return {
    type: "presence",
    timestamp: (p.la ?? 0) * 1000,
    userID,
    statuses: p.a,
  };
};

export const formatProxyPresence = (presence: unknown, userID: string): FormattedPresence | null => {
  const p = presence as ProxyPresenceShape;
  if (p.lat === undefined || p.p === undefined) return null;
  return {
    type: "presence",
    timestamp: p.lat * 1000,
    userID,
    statuses: p.p,
  };
};
