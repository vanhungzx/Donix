import { enrichPlayerData, getAccountInformation, initializeTokenForRegion } from './lib/freefire/info/main';
import { loadProtobufRoot } from './lib/freefire/info/protobuf';

async function info(
  uid: string,
  region: string = 'VN'
): Promise<any> {
  try {
    const root = await loadProtobufRoot();
    await initializeTokenForRegion(region, root);
    const accountInfo = await getAccountInformation(uid, "7", region, "/GetPlayerPersonalShow", root);
    return enrichPlayerData(accountInfo);
  } catch (error: any) {
    throw new Error(`Failed to get player info: ${error.message}`);
  }
}

const freefireService = {
  info
};

export default freefireService;
export { info };
