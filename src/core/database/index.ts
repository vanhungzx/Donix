import { getUserData } from "./user-data";
import { getThreadData } from "./thread-data";
import { closeDatabase, initDatabase, startDatabaseMaintenance } from "./schema";

export async function initDatabases(): Promise<void> {
  await initDatabase();
  
  startDatabaseMaintenance();
}

export function getDatabases(bot?: any) {
  const userData = getUserData(bot);
  const threadData = getThreadData(bot);

  if (bot) {
    userData.setBot(bot);
    threadData.setBot(bot);
  }

  return {
    userData,
    threadData,
  };
}

export async function closeDatabases(): Promise<void> {
  await closeDatabase();
}
export type { UserData } from "./user-data";
export type { ThreadData } from "./thread-data";
