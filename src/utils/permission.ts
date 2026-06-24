export const hasPermission = (senderID: string, list: string[]) => {
  return list.includes(senderID);
};
