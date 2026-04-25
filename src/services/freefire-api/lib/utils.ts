export type ItemDetails = Record<string, unknown>;

type UtilsModule = {
  loadItems(): Record<string, ItemDetails>;
  getItemDetails(itemId: string | number): ItemDetails;
  processPlayerItems(playerData: Record<string, unknown>): Record<string, unknown>;
};

const mod = require("./utils.js") as UtilsModule;

export const loadItems = mod.loadItems;
export const getItemDetails = mod.getItemDetails;
export const processPlayerItems = mod.processPlayerItems;
export default mod;
