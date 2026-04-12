interface RefreshDataHandlerOptions {
  client: any;
  userData: any;
  threadData: any;
  logger: any;
}

function toIdObj(v: any): { id: string } {
  const id = typeof v === "object" ? v.id || v.userFbId || v.user_id || v : v;
  return { id: String(id) };
}

function normalizeList(arr: any[]): Array<{ id: string }> {
  if (!Array.isArray(arr)) return [];
  const map = new Map<string, { id: string }>();
  for (const x of arr) {
    const obj = toIdObj(x);
    map.set(obj.id, obj);
  }
  return Array.from(map.values());
}

async function getUserInfoWithRetry(
  userData: any,
  id: string,
  logger: any,
  maxRetries: number = 3
): Promise<any> {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let i = 0; i < maxRetries; i++) {
    try {
      if (typeof userData.info === "function") {
        const u = await userData.info(id);
        if (u?.name) return u;
      }
    } catch (e: any) {
      logger.error(`Retry ${i + 1} get info ${id}: ${e.message}`);
    }
    await delay(1000);
  }
  return null;
}

export function createRefreshDataHandler(params: RefreshDataHandlerOptions) {
  const { client, userData, threadData, logger } = params;

  return async ({ event }: { event: any }) => {
    const { threadID, logMessageType, logMessageData } = event;

    if (!threadID || !logMessageType) return;

    try {
      const td = await threadData.get(threadID);
      const info = td?.threadInfo ?? {};

      const up = () => threadData.update(threadID, { threadInfo: info });

      switch (logMessageType) {
        case "log:thread-name": {
          info.threadName = logMessageData.name;
          logger.success(`Đổi tên nhóm ${threadID} -> ${info.threadName}`);
          await up();
          break;
        }

        case "log:thread-admins": {
          const listRaw =
            logMessageData.ADMIN_LIST ||
            logMessageData.admins ||
            logMessageData.admin_ids ||
            logMessageData.adminsList ||
            logMessageData.ADMIN_IDS;

          if (Array.isArray(listRaw) && listRaw.length) {
            info.adminIDs = normalizeList(listRaw);
            logger.success(`Đồng bộ QTV nhóm "${info.threadName || threadID}" (${info.adminIDs.length})`);
            await up();
            break;
          }

          // Graph/Messenger gửi admin_event / target_id (snake_case); bản cũ dùng ADMIN_EVENT / TARGET_ID
          const adminEvent = String(
            logMessageData.ADMIN_EVENT ?? logMessageData.admin_event ?? ""
          ).toLowerCase();
          const add =
            adminEvent === "add_admin" ||
            adminEvent === "add" ||
            logMessageData.action === "add";
          const target = String(
            logMessageData.TARGET_ID ||
            logMessageData.target_id ||
            logMessageData.userFbId ||
            logMessageData.id ||
            ""
          );

          info.adminIDs = normalizeList(info.adminIDs || []);

          if (target) {
            if (add) {
              if (!info.adminIDs.some((a: { id: string }) => a.id === target)) {
                info.adminIDs.push({ id: target });
              }
            } else {
              info.adminIDs = info.adminIDs.filter((a: { id: string }) => a.id !== target);
            }

            const name = (await userData.getName(target)) || target;
            logger.success(
              `Nhóm "${info.threadName || threadID}" ${add ? "thêm" : "xóa"} QTV: ${name} (${target})`
            );
            await up();
          }
          break;
        }

        case "log:subscribe": {
          const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          const added = event?.logMessageData?.addedParticipants || [];
          const done = new Set<string>();

          info.userInfo = Array.isArray(info.userInfo) ? info.userInfo : [];

          for (const p of added) {
            const uid = String(p.userFbId);
            if (done.has(uid)) continue;

            done.add(uid);

            try {
              let u = await userData.get(uid);
              let ui = u?.userInfo;

              if (!u || !ui?.name) {
                ui = await getUserInfoWithRetry(userData, uid, logger);
              }

              if (!ui) {
                logger.error(`Cannot get info for user ${uid}`);
                continue;
              }

              const merge = { id: uid, ...ui };
              const i = info.userInfo.findIndex((x: any) => x?.id === uid);

              if (i !== -1) {
                info.userInfo[i] = { ...info.userInfo[i], ...merge };
              } else {
                info.userInfo.push(merge);
              }

              if (!u) {
                const payload = {
                  name: ui.name || p.fullName || "Undefined User",
                  userInfo: ui,
                  setting: {},
                  gender: ui.gender || "UNKNOWN",
                  data: {},
                };
                await userData.create(uid, payload);
                logger.success(`Created new user: ${payload.name} (${uid})`);
              }

              logger.info(`User ${p.fullName || ui.name || uid} joined [${info.threadName || "Unknown"}]`);
              await delay(300);
            } catch (e: any) {
              logger.error(`Process user ${uid} failed: ${e.message}`);
            } finally {
              done.delete(uid);
            }
          }

          await up();
          break;
        }

        case "log:unsubscribe": {
          const uid = String(logMessageData.leftParticipantFbId);
          const name = (await userData.getName(uid)) || uid;

          if (uid === String(client.id)) {
            const label = info.threadName || threadID;
            try {
              await threadData.update(threadID, {
                threadName: null,
                threadInfo: null,
                banned: null,
                settings: null,
                data: null,
                lastActive: null,
              } as Record<string, unknown>);
              logger.success(
                `Bot rời nhóm ${label}, đã xoá dữ liệu nhóm, giữ thống kê tương tác (xoá tt bằng check reset)`
              );
            } catch (e: any) {
              logger.error(
                `Bot rời nhóm ${label}, lỗi khi xoá dữ liệu nhóm (tương tác vẫn giữ trong DB): ${e?.message || e}`
              );
            }
            return;
          }

          info.participantIDs = Array.isArray(info.participantIDs)
            ? info.participantIDs.filter((id: string) => id !== uid)
            : [];
          info.userInfo = Array.isArray(info.userInfo)
            ? info.userInfo.filter((u: any) => u?.id !== uid)
            : [];

          await up();

          const list = await threadData.getAll("threadInfo");
          const still = list.some(
            (t: any) =>
              t &&
              t.threadInfo?.threadID !== threadID &&
              (t.threadInfo?.userInfo || []).some((u: any) => u?.id === uid)
          );

          const mc = (await threadData.get(threadID))?.messageCount;

          if (mc) {
            for (const k of ["total", "week", "day", "month"]) {
              if (Array.isArray(mc[k])) {
                mc[k] = mc[k].filter((x: any) => x.id !== uid);
              }
            }
            await threadData.update(threadID, { messageCount: mc });
            logger.success(
              `Đã xoá thống kê của ${name} (${uid}) khỏi nhóm ${info.threadName || "Unknown"}`
            );
          }

          if (still) {
            const ud = await userData.get(uid);
            const jt = Object.fromEntries(
              Object.entries(ud?.joinedThreads || {}).filter(([id]) => id !== threadID)
            );
            await userData.update(uid, { joinedThreads: jt });
            logger.success(
              `Đã xoá thời gian tham gia của ${name} (${uid}) tại nhóm ${info.threadName || threadID}`
            );
            logger.success(`User ${name} (${uid}) rời nhóm ${info.threadName || "Unknown"}, vẫn còn ở nhóm khác`);
          } else {
            await userData.del(uid);
            logger.success(`User ${name} (${uid}) rời tất cả nhóm, đã xoá dữ liệu người dùng`);
          }

          break;
        }

        case "log:thread-approval-mode": {
          const mode = logMessageData.APPROVAL_MODE === "1";
          info.approvalMode = mode;
          logger.success(`Phê duyệt nhóm [${info.threadName || threadID}]: ${mode ? "Bật" : "Tắt"}`);
          await up();
          break;
        }

        case "log:thread-color": {
          const { accessibility_label, theme_emoji, theme_color, theme_id } = logMessageData;
          info.emoji = theme_emoji;
          info.threadTheme = { id: theme_id, accessibility_label };
          info.color = theme_color;
          logger.success(
            `Cập nhật chủ đề [${info.threadName || threadID}]: ${accessibility_label}, emoji: ${theme_emoji}, color: ${theme_color}`
          );
          await up();
          break;
        }

        case "log:user-nickname": {
          const { participant_id, nickname } = logMessageData;
          info.nicknames = info.nicknames ?? {};

          if (nickname === "") {
            delete info.nicknames[participant_id];
            logger.success(`Xoá biệt danh ${participant_id} trong ${info.threadName || threadID}`);
          } else {
            info.nicknames[participant_id] = nickname;
            logger.success(`Cập nhật biệt danh ${participant_id} -> "${nickname}" trong ${info.threadName || threadID}`);
          }

          await up();
          break;
        }

        case "log:thread-icon": {
          const emoji = logMessageData.thread_quick_reaction_emoji ?? logMessageData.thread_icon;
          info.emoji = emoji;
          logger.success(`Biểu tượng nhóm [${info.threadName || threadID}] -> ${emoji}`);
          await up();
          break;
        }

        default:
          return;
      }
    } catch (e: any) {
      logger.error(`Lỗi cập nhật threadData: ${e.stack || e.message || JSON.stringify(e)}`);
    }
  };
}
