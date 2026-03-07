export const formatPresence = (presence: any, userID: string) => ({
  type: "presence",
  timestamp: presence.la * 1000,
  userID,
  statuses: presence.a,
});

export const formatProxyPresence = (presence: any, userID: string) => {
  if (presence.lat === undefined || presence.p === undefined) return null;
  return {
    type: "presence",
    timestamp: presence.lat * 1000,
    userID,
    statuses: presence.p,
  };
};
