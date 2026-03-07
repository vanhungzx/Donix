import { initBank } from "./bank";
import { autoInteractFeed, sendTop } from "./interactions";
import { notifyExp, updNick } from "./nickname";
import { createSmartThreadUpdater } from "./thread";
import { TokenMgr } from "./token";
import type { FactoryArgs } from "./types";
export default function factory(args: FactoryArgs) {
  const { client, logger, userData, threadData, config } = args;

  let smartUpdater: Awaited<ReturnType<typeof createSmartThreadUpdater>> | null = null;
  createSmartThreadUpdater({
    client,
    logger,
    threadData,
    userData,
  }).then(updater => {
    smartUpdater = updater;
    logger?.info?.("Smart Thread Updater", "Đã khởi tạo thành công");
  }).catch(e => {
    logger?.error?.("Smart Thread Updater", `Lỗi khởi tạo: ${e?.message}`);
  });

  return {
    initBank: () => initBank(logger, userData),
    TokenMgr: new TokenMgr(logger),
    updThreads: async () => {

      if (smartUpdater?.triggerUpdate) {
        await smartUpdater.triggerUpdate();
      } else {
        logger?.warn?.("Smart Thread Updater", "Chưa sẵn sàng, bỏ qua lần update này");
      }
    },
    getThreadInfoSmart: async (tid: string) => {
      if (!smartUpdater) {

        return null;
      }
      return await smartUpdater(tid);
    },
    updNick: () => updNick(client, logger, threadData, config),
    notifyExp: () => notifyExp(client, logger, threadData, userData),
    sendTop: () => sendTop(client, logger, threadData, userData),
    autoInteractFeed: () => autoInteractFeed(client, logger)
  };
}
