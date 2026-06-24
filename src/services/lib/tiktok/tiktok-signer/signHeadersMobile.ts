import { Argus } from './argus.js';
import { bytesToHex } from './buffer-utils.js';
import { md5Hex } from './crypto-utils.js';
import { Gorgon } from './gorgon.js';
import { Ladon } from './ladon.js';
import { randomBytes } from 'crypto';
import { randomUUID } from 'crypto';

const TRILL_DEFAULT_LICENSE_ID = 2142840551;

const getTrillFeedBaseParams = (overrides: Record<string, unknown> = {}): Record<string, string | number> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const iid = String(overrides.iid ?? overrides.install_id ?? '7627523021921896213');
  const device_id = String(overrides.device_id ?? '7626781349097424405');
  return {
    device_platform: 'android',
    os: 'android',
    _rticket: Date.now(),
    cdid: String(overrides.cdid ?? randomUUID()),
    channel: 'googleplay',
    aid: 1180,
    app_name: 'trill',
    version_code: 440604,
    version_name: '44.6.4',
    manifest_version_code: 440604,
    update_version_code: 440604,
    resolution: '1080*1920',
    dpi: 480,
    device_type: String(overrides.device_type ?? 'PGT-AN00'),
    device_brand: String(overrides.device_brand ?? 'Honor'),
    language: 'vi',
    os_api: 28,
    os_version: '9',
    ac: 'wifi',
    app_type: 'normal',
    sys_region: 'VN',
    last_install_time: Number(overrides.last_install_time ?? timestamp - 120),
    timezone_name: 'Asia/Ho_Chi_Minh',
    app_language: 'vi',
    timezone_offset: 25200,
    locale: 'vi-VN',
    ts: timestamp,
    iid,
    device_id,
    openudid: String(overrides.openudid ?? bytesToHex(new Uint8Array(randomBytes(8)))),
    pull_type: Number(overrides.pull_type ?? 4),
    is_non_personalized: Number(overrides.is_non_personalized ?? 0),
    cmpl_enc: String(overrides.cmpl_enc ?? 'unknown')
  };
};

const getBaseMobileParams = (): Record<string, string | number> => ({
  _rticket: Date.now(),
  device_id: '7555746395380368897',
  ts: Math.floor(Date.now() / 1000),
  iid: '7580036180676593416',
  openudid: bytesToHex(new Uint8Array(randomBytes(8))),
  cdid: randomUUID(),
  manifest_version_code: 410405,
  app_language: 'en',
  app_type: 'normal',
  app_package: 'com.zhiliaoapp.musically.go',
  channel: 'googleplay',
  device_type: 'SM-G998B',
  language: 'en',
  host_abi: 'x86_64',
  locale: 'en',
  resolution: '900*1600',
  update_version_code: 410405,
  ac2: 'wifi',
  sys_region: 'US',
  os_api: 28,
  timezone_name: 'Asia/Saigon',
  dpi: 240,
  carrier_region: 'VN',
  ac: 'wifi',
  os: 'android',
  os_version: '9',
  timezone_offset: 25200,
  version_code: 410405,
  app_name: 'musically_go',
  ab_version: '41.4.5',
  version_name: '41.4.5',
  device_brand: 'samsung',
  op_region: 'VN',
  ssmix: 'a',
  device_platform: 'android',
  build_number: '41.4.5',
  region: 'US',
  aid: 1340
});

const createMobileHeadersSignature = ({
  queryParams,
  bodyPayload,
  cookies,
  aid = 1340,
  licenseId = 1611921764,
  gorgonVersion = '0404',
  sdkVersion = 'v05.00.03-ov-android',
  sdkVersionInt = 167773760
}: {
  queryParams: string;
  bodyPayload?: string | Uint8Array | Buffer;
  cookies?: string;
  aid?: number;
  licenseId?: number;
  gorgonVersion?: '0404' | '8404';
  sdkVersion?: string;
  sdkVersionInt?: number;
}): Record<string, string | undefined> => {
  const unixTimestamp = Math.floor(Date.now() / 1000);
  const gorgonHeaders = new Gorgon({
    params: queryParams,
    unix: unixTimestamp,
    bodyPayload,
    cookies,
    gorgonVersion
  }).getValue();
  const hasBody = Boolean(bodyPayload && bodyPayload.length);
  const x_ss_stub = hasBody ? md5Hex(bodyPayload as string | Uint8Array | Buffer) : undefined;
  return {
    'X-Gorgon': gorgonHeaders['X-Gorgon'],
    'X-Khronos': gorgonHeaders['X-Khronos'],
    'x-ss-req-ticket': gorgonHeaders['x-ss-req-ticket'],
    'X-Ladon': Ladon.encrypt({ khronos: unixTimestamp, licenseId, aid }),
    'X-Argus': Argus.getSign({
      queryParams,
      x_ss_stub,
      timestamp: unixTimestamp,
      aid,
      licenseId,
      sdkVersion,
      sdkVersionInt
    }),
    'x-ss-stub': x_ss_stub ? x_ss_stub.toUpperCase() : undefined
  };
};

export { getBaseMobileParams, getTrillFeedBaseParams, TRILL_DEFAULT_LICENSE_ID };
export default createMobileHeadersSignature;
