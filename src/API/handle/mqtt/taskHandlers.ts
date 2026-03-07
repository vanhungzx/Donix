export function extractMTID(data: any): { messageID: string | null; threadID: string | null } {
  let messageID: string | null = null;
  let threadID: string | null = null;

  function search(step: any): void {
    if (Array.isArray(step)) {
      for (const item of step) {
        if (typeof item === "string") {
          if (item.startsWith("mid.$") && !messageID) {
            messageID = item;
          } else if (/^\d{16}$/.test(item) && !threadID) {
            threadID = item;
          }
        }
        search(item);
      }
    } else if (typeof step === "object" && step !== null) {
      for (const key in step) {
        search(step[key]);
      }
    }
  }

  if (data && data.step) {
    search(data.step);
  }

  return { messageID, threadID };
}

export function getTaskResponseData(taskType: string, payload: any): any {
  try {
    switch (taskType) {
      case "send_message": {
        console.log(JSON.stringify(payload, null, 2));
        return extractMTID(payload);
      }
      case "set_message_reaction": {
        return {
          mid: payload.step[1][2][2][1][4]
        };
      }
      case "edit_message": {
        return {
          mid: payload.step[1][2][2][1][2]
        };
      }
    }
  } catch {
    return null;
  }
}
