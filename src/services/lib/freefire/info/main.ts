import axios from 'axios';
import { createCipheriv } from 'crypto';
import { readFileSync } from 'fs';
import https from 'https';
import { join } from 'path';
import protobuf from 'protobufjs';
import { URL } from 'url';
const MAIN_KEY = Buffer.from('WWcmdGMlREV1aDYlWmNeOA==', 'base64');
const MAIN_IV = Buffer.from('Nm95WkRyMjJFM3ljaGpNJQ==', 'base64');
const RELEASEVERSION = "OB49";
const USERAGENT = "Dalvik/2.1.0 (Linux; U; Android 13; CPH2095 Build/RKQ1.211119.001)";
const SUPPORTED_REGIONS = new Set(["IND", "BR", "US", "SAC", "NA", "SG", "RU", "ID", "TW", "VN", "TH", "ME", "PK", "CIS", "BD", "EUROPE"]);

function pad(text: Buffer): Buffer {
  const blockSize = 16;
  const remainder = text.length % blockSize;
  const paddingLength = remainder === 0 ? blockSize : (blockSize - remainder);
  const padding = Buffer.alloc(paddingLength, paddingLength);
  return Buffer.concat([text, padding]);
}
function aesCbcEncrypt(key: Buffer, iv: Buffer, plaintext: Buffer): Buffer {
  const padded = pad(plaintext);
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
}
async function jsonToProto(jsonData: string, messageType: protobuf.Type): Promise<Buffer> {
  const jsonObj = JSON.parse(jsonData);
  if (!messageType) {
    throw new Error(`Message type not found`);
  }
  let message: protobuf.Message;
  try {
    message = messageType.fromObject(jsonObj) as protobuf.Message;
  } catch (error: any) {
    throw new Error(`Failed to create protobuf message: ${error.message}`);
  }
  if (!message) {
    throw new Error(`Failed to create protobuf message from: ${jsonData}`);
  }
  const errMsg = messageType.verify(message);
  if (errMsg) {
    throw new Error(`Invalid protobuf message: ${errMsg}`);
  }
  const encoded = messageType.encode(message).finish();
  if (!encoded || encoded.length === 0) {
    throw new Error(`Failed to encode protobuf message`);
  }
  return Buffer.from(encoded);
}
function getAccountCredentials(region: string): string {
  const r = region.toUpperCase();
  if (r === "IND") {
    return "uid=3692279677&password=473AFFEF67F708CBB0962A958BB2809DA0843EA41BDB70D738FD9527EA04B27B";
  } else if (["BR", "US", "SAC", "NA"].includes(r)) {
    return "uid=3692292847&password=FC22F6812C850FF7D8DB8C5474A106B6FE22CB10C0A6673837216A32675E5649";
  } else if (r === "VN") {
    return "uid=3686689562&password=AD9C4A2B51A749481913F72A36F68A9F231520E9AC29B244DB47A64FD7353A12";
  } else if (r === "SG") {
    return "uid=3692265171&password=A2A5E3C252A35B2BB30698BD1469A759417A68A069CF6980ED959EB01D352E28";
  } else if (r === "ID") {
    return "uid=3692307512&password=4AA06E1DB3F998ABDBDA74578D26B0C84700EC5C079751E7C8F1626048DDBCAE";
  } else if (r === "TH") {
    return "uid=3692333198&password=0ED64C5A89E09B8BE538829B0304FE5F5F7EA3BBE645A341C73ECA49143D2211";
  } else if (r === "TW") {
    return "uid=3692312456&password=1A062FD700DA8F826AF84A37EE2B62121B79516AF71666949C72FFF42D1C554A";
  } else {
    try {
      const accountsPath = join(process.cwd(), 'services/lib/freefire/info/accounts.txt');
      const content = readFileSync(accountsPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        throw new Error("File accounts.txt trống.");
      }
      const randomLine = lines[Math.floor(Math.random() * lines.length)];
      const [uid, password] = randomLine.trim().split(/\s+/);
      return `uid=${uid}&password=${password}`;
    } catch (error: any) {
      return `ERROR: ${error.message}`;
    }
  }
}
interface TokenResponse {
  access_token?: string;
  open_id?: string;
}
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (error.response?.status === 429) {
        const delayMs = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await delay(delayMs);
      } else if (attempt < maxRetries - 1) {
        await delay(initialDelay * (attempt + 1));
      }
    }
  }
  throw lastError;
}
async function getAccessToken(account: string): Promise<{ access_token: string; open_id: string }> {
  const url = "https://ffmconnect.live.gop.garenanow.com/oauth/guest/token/grant";
  const payload = account + "&response_type=token&client_type=2&client_secret=2ee44819e9b4598845141067b281621874d0d5d7af9d8f7e00c1e54715b7d1e3&client_id=100067";
  const headers: Record<string, string> = {
    'User-Agent': USERAGENT,
    'Connection': "Keep-Alive",
    'Accept-Encoding': "gzip",
    'Content-Type': "application/x-www-form-urlencoded"
  };
  return retryWithBackoff(async () => {
    const resp = await axios.post(url, payload, {
      headers,
      maxRedirects: 0
    });
    const data = resp.data as TokenResponse;
    return {
      access_token: data?.access_token || "0",
      open_id: data?.open_id || "0"
    };
  }, 3, 2000);
}
async function createJwt(region: string, root: protobuf.Root): Promise<[string, string, string]> {
  const account = getAccountCredentials(region);
  const { access_token: tokenVal, open_id } = await getAccessToken(account);

  const body = JSON.stringify({
    open_id: open_id,
    open_id_type: "4",
    login_token: tokenVal,
    orign_platform_type: "4"
  });

  const LoginReq = root.lookupType('FreeFire.LoginReq');
  if (!LoginReq) {
    throw new Error('LoginReq type not found in protobuf root');
  }
  const protoBytes = await jsonToProto(body, LoginReq);
  const payload = aesCbcEncrypt(MAIN_KEY, MAIN_IV, protoBytes);
  const url = "https://loginbp.ggblueshark.com/MajorLogin";
  const headers: Record<string, string> = {
    'User-Agent': USERAGENT,
    'Connection': "Keep-Alive",
    'Accept-Encoding': "gzip",
    'Content-Type': "application/octet-stream",
    'X-Unity-Version': "2018.4.11f1",
    'X-GA': "v1 1",
    'ReleaseVersion': RELEASEVERSION
  };
  const respBuffer = await new Promise<Buffer>((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': payload.length.toString()
      }
    };
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          reject(new Error(`Login request failed: ${res.statusCode}`));
        } else {
          resolve(buffer);
        }
      });
    });
    req.on('error', (error) => {
      reject(new Error(`Login request failed: ${error.message}`));
    });

    req.write(payload);
    req.end();
  });

  if (respBuffer.length === 0) {
    throw new Error(`Empty response from login server for region ${region}`);
  }
  const LoginRes = root.lookupType('FreeFire.LoginRes');
  let msg;
  try {
    msg = LoginRes.decode(respBuffer);
  } catch (error: any) {
    throw new Error(`Failed to decode protobuf response: ${error.message}`);
  }
  const msgObj = LoginRes.toObject(msg, {
    longs: String,
    enums: String,
    bytes: String,
    defaults: true,
    arrays: true,
    objects: true,
    oneofs: true
  }) as any;
  const token = (msgObj as any).token || '0';
  const lockRegion = (msgObj as any).lockRegion || (msgObj as any).lock_region || '0';
  const serverUrl = (msgObj as any).serverUrl || (msgObj as any).server_url || '0';
  if (!serverUrl || serverUrl === '0') {
    throw new Error(`Failed to get server URL for region ${region}`);
  }
  
  return [`Bearer ${token}`, lockRegion, serverUrl];
}
export async function initializeTokens(root: protobuf.Root, regions?: string[]): Promise<void> {
  const regionsToInit = regions || Array.from(SUPPORTED_REGIONS);
  for (const r of regionsToInit) {
    try {
      await createJwt(r, root);
      if (regionsToInit.length > 1) {
        await delay(500);
      }
    } catch (error: any) {}
  }
}
export async function initializeTokenForRegion(region: string, root: protobuf.Root): Promise<void> {
  await initializeTokens(root, [region]);
}
async function getTokenInfo(region: string, root: protobuf.Root): Promise<[string, string, string]> {
  
  return await createJwt(region, root);
}
export async function getAccountInformation(
  uid: string,
  unk: string,
  region: string,
  endpoint: string,
  root: protobuf.Root,
  _useCache: boolean = false
): Promise<any> {
  const r = region.toUpperCase();
  if (!SUPPORTED_REGIONS.has(r)) {
    throw new Error(`Unsupported region: ${region}`);
  }
  
  const GetPlayerPersonalShow = root.lookupType('main.GetPlayerPersonalShow');
  const payload = await jsonToProto(JSON.stringify({ a: parseInt(uid, 10), b: parseInt(unk, 10) }), GetPlayerPersonalShow);
  const dataEnc = aesCbcEncrypt(MAIN_KEY, MAIN_IV, payload);
  const [token, _lock, server] = await getTokenInfo(region, root);
  if (!server || server === '0' || !server.startsWith('http')) {
    throw new Error(`Invalid server URL for region ${region}: ${server}`);
  }
  const headers: Record<string, string> = {
    'User-Agent': USERAGENT,
    'Connection': "Keep-Alive",
    'Accept-Encoding': "gzip",
    'Content-Type': "application/octet-stream",
    'Authorization': token,
    'X-Unity-Version': "2018.4.11f1",
    'X-GA': "v1 1",
    'ReleaseVersion': RELEASEVERSION
  };
  const respBuffer = await new Promise<Buffer>((resolve, reject) => {
    const urlObj = new URL(server + endpoint);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': dataEnc.length.toString()
      }
    };
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('error', (error) => {
      reject(error);
    });
    req.write(dataEnc);
    req.end();
  });
  const AccountPersonalShowInfo = root.lookupType('freefire.AccountPersonalShowInfo');
  let decoded: protobuf.Message;
  try {
    decoded = AccountPersonalShowInfo.decode(respBuffer);
  } catch (error: any) {
    throw error;
  }
  const decodedObj = AccountPersonalShowInfo.toObject(decoded, {
    longs: String,
    enums: String,
    bytes: String,
    defaults: true,
    arrays: true,
    objects: true,
    oneofs: true
  });
  
  return decodedObj;
}
function enrichClothesData(clothes: number[]): any[] {
  return clothes.map(itemId => {
    const category = getItemCategory(itemId);
    return {
      id: itemId,
      category: category,
      type: getItemType(itemId),
    };
  });
}
function getItemCategory(itemId: number): string {
  const idStr = itemId.toString();
  if (idStr.startsWith('2')) return 'Head';
  if (idStr.startsWith('3')) return 'Upper';
  if (idStr.startsWith('4')) return 'Lower';
  if (idStr.startsWith('5')) return 'Shoes';
  if (idStr.startsWith('6')) return 'Backpack';
  if (idStr.startsWith('7')) return 'Gloves';
  if (idStr.startsWith('21')) return 'Head Accessory';
  if (idStr.startsWith('22')) return 'Face';
  if (idStr.startsWith('23')) return 'Hair';
  return 'Unknown';
}
function getItemType(itemId: number): string {
  const idStr = itemId.toString();
  if (idStr.startsWith('211')) return 'Hat';
  if (idStr.startsWith('212')) return 'Helmet';
  if (idStr.startsWith('214')) return 'Mask';
  if (idStr.startsWith('203')) return 'Shirt';
  if (idStr.startsWith('204')) return 'Pants';
  if (idStr.startsWith('205')) return 'Shoes';
  return 'Item';
}
function enrichSkillsData(equipedSkills: number[]): any[] {
  const skills: any[] = [];
  for (let i = 0; i < equipedSkills.length; i += 4) {
    if (i + 3 < equipedSkills.length) {
      skills.push({
        slot_id: equipedSkills[i],
        skill_id: equipedSkills[i + 1],
        level: equipedSkills[i + 2],
        slot_index: equipedSkills[i + 3],
      });
    }
  }
  return skills;
}
function enrichWeaponSkins(weaponSkinShows: number[]): any[] {
  return weaponSkinShows.map(skinId => ({
    id: skinId,
    type: 'Weapon Skin',
  }));
}
export function enrichPlayerData(data: any): any {
  const enriched = { ...data };
  if (enriched.profile_info) {
    if (enriched.profile_info.clothes) {
      enriched.profile_info.clothes_detail = enrichClothesData(enriched.profile_info.clothes);
    }
    if (enriched.profile_info.equiped_skills) {
      enriched.profile_info.skills_detail = enrichSkillsData(enriched.profile_info.equiped_skills);
    }
  }
  if (enriched.basic_info) {
    if (enriched.basic_info.weapon_skin_shows) {
      enriched.basic_info.weapon_skins_detail = enrichWeaponSkins(enriched.basic_info.weapon_skin_shows);
    }
  }
  enriched.summary = {
    total_clothes: enriched.profile_info?.clothes?.length || 0,
    total_skills: enriched.profile_info?.skills_detail?.length || 0,
    total_weapon_skins: enriched.basic_info?.weapon_skin_shows?.length || 0,
    has_pet: !!enriched.pet_info?.id,
    has_clan: !!enriched.clan_basic_info?.clan_id,
  };
  return enriched;
}
