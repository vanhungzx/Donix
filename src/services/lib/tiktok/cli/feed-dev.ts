#!/usr/bin/env node
import path from 'path';
import qs from 'qs';
import fs from 'fs-extra';
import { getDirname } from '../../../utils/paths.js';
import { Gorgon } from '../tiktok-signer/gorgon.js';
import createMobileHeadersSignature, {
  getTrillFeedBaseParams,
  TRILL_DEFAULT_LICENSE_ID
} from '../tiktok-signer/signHeadersMobile.js';
import { md5Hex } from '../tiktok-signer/crypto-utils.js';
import { ProtoBuf, ProtoError } from '../tiktok-signer/protobuf.js';
import { TIKTOK_API_URL } from '../constants/index.js';
import {
  getFYPFeed,
  getFYPFeedAwemeV2,
  resolveAwemeV2ProtobufBody,
  buildAwemeV2FeedRequestBody
} from '../services/feed.service.js';
import { getTiktokCredentials } from '../services/helpers.js';
import { inferAwemeV2Response } from '../utils/protoFieldInfer.js';
import { parseAwemeV2FeedResponse } from '../utils/awemeV2ProtoParser.js';
import { decodeGorgon0404, decodeGorgon8404 } from '../utils/gorgonInspect.js';
import { formatProtoFields } from '../utils/protoWireFormat.js';

type JsonObject = Record<string, unknown>;
const __dirname = getDirname(import.meta.url);
const repoRoot = path.join(__dirname, '../../..');

const asErrorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const section = (title: string): void => console.log(`\n── ${title} ──`);

function printHelp(): void {
  console.log(`
TikTok feed dev CLI (services/tiktok/cli/feed-dev.ts)

  (default)     signer + dump body file nếu có
  lite          getFYPFeed lite-fyp
  auto          getFYPFeed auto (v2 → lite)
  v2 | aweme    aweme v2 + parse protobuf
  resp          giống v2
  post [path]   POST aweme v2 động; post chain → 2 trang
  proto [file]  mò proto từ .bin
`);
}

async function dumpProtobufFile(filePath: string): Promise<void> {
  section('Giải mã protobuf (tự động)');
  const buf = await fs.readFile(filePath);
  const u8 = new Uint8Array(buf);
  console.log('File:', filePath);
  console.log('Kích thước:', u8.length, 'byte');
  try {
    const parsed = ProtoBuf.fromBuf(u8);
    console.log(JSON.stringify(formatProtoFields(parsed as Record<string, unknown>, 3), null, 2));
  } catch (e: unknown) {
    if (e instanceof ProtoError) console.log('ProtoBuf.fromBuf lỗi:', e.message);
    else console.log('Lỗi:', asErrorMessage(e));
  }
}

async function testSigner(): Promise<void> {
  section('Gorgon');
  const q = 'aid=1180&device_platform=android';
  const unix = Math.floor(Date.now() / 1000);
  const body = new Uint8Array([1, 2, 3, 4]);
  const g0404 = new Gorgon({ params: q, unix, bodyPayload: body, cookies: 'a=b', gorgonVersion: '0404' }).getValue();
  const g8404 = new Gorgon({ params: q, unix, bodyPayload: body, cookies: 'a=b', gorgonVersion: '8404' }).getValue();
  console.log('0404 X-Gorgon full:', g0404['X-Gorgon']);
  console.log('8404 X-Gorgon full:', g8404['X-Gorgon']);
  section('Giải mã X-Gorgon (auto)');
  const dec8404 = decodeGorgon8404(g8404['X-Gorgon']) as JsonObject;
  console.log('8404 →', JSON.stringify(dec8404, null, 2));
  console.log('0404 →', JSON.stringify(decodeGorgon0404(g0404['X-Gorgon']), null, 2));
  section('createMobileHeadersSignature (Trill + 8404 + body)');
  const trillParams = getTrillFeedBaseParams({ iid: '7627523021921896213', device_id: '7626781349097424405' });
  const sig = createMobileHeadersSignature({
    queryParams: qs.stringify(trillParams),
    bodyPayload: body,
    cookies: 'store-idc=alisg',
    aid: 1180,
    licenseId: TRILL_DEFAULT_LICENSE_ID,
    gorgonVersion: '8404',
    sdkVersion: 'v05.01.02-alpha.7-ov-android',
    sdkVersionInt: 83952160
  });
  console.log('x-ss-stub:', sig['x-ss-stub']);
  console.log('MD5(body test) === x-ss-stub:', md5Hex(body).toUpperCase() === sig['x-ss-stub']);
}

async function testProtobufPath(): Promise<void> {
  section('Protobuf body (aweme v2)');
  const defaultBin = path.join(repoRoot, 'storage', 'cookies', 'tiktok_aweme_v2_feed_body.bin');
  const envPath = process.env.TIKTOK_AWEME_V2_FEED_BODY;
  const hasDefault = await fs.pathExists(defaultBin);
  const protoPath = envPath && (await fs.pathExists(envPath)) ? envPath : hasDefault ? defaultBin : null;
  if (protoPath) await dumpProtobufFile(protoPath);
}

async function testLiteFeed(): Promise<void> {
  section('getFYPFeed lite-fyp');
  const r = (await getFYPFeed({ feedMode: 'lite-fyp', count: 3 })) as JsonObject;
  console.log('feedSource:', r.feedSource);
}

async function testAutoFeed(): Promise<void> {
  section('getFYPFeed auto');
  const r = (await getFYPFeed({ feedMode: 'auto', count: 3 })) as JsonObject;
  console.log('feedSource:', r.feedSource);
}

async function testV2Feed(): Promise<void> {
  section('getFYPFeed aweme-v2');
  const r = (await getFYPFeed({ feedMode: 'aweme-v2' })) as JsonObject;
  console.log('responseKind:', r.responseKind);
}

async function testRespOnly(): Promise<void> {
  await testV2Feed();
}

async function testPostCapture(): Promise<void> {
  const sub = process.argv[3]?.trim();
  if (sub === 'chain' || sub === '--chain') return testPostChain();
  const opts: { includeRawResponse: boolean; minCursorB64?: string; maxCursorB64?: string; protobufBodyPath?: string } = {
    includeRawResponse: true,
    minCursorB64: process.env.TIKTOK_FEED_MIN_CURSOR,
    maxCursorB64: process.env.TIKTOK_FEED_MAX_CURSOR
  };
  if (sub) opts.protobufBodyPath = sub;
  let preview = await resolveAwemeV2ProtobufBody(opts);
  if (!preview?.length) preview = buildAwemeV2FeedRequestBody({ minCursorB64: opts.minCursorB64, maxCursorB64: opts.maxCursorB64 });
  const cred = getTiktokCredentials();
  const r = (await getFYPFeedAwemeV2(opts, cred)) as JsonObject;
  console.log('responseKind:', r.responseKind);
}

async function testPostChain(): Promise<void> {
  const cred = getTiktokCredentials();
  const r1 = (await getFYPFeedAwemeV2({ includeRawResponse: true }, cred)) as JsonObject;
  const pagination = (r1.pagination || {}) as JsonObject;
  await getFYPFeedAwemeV2(
    {
      includeRawResponse: true,
      minCursorB64: String(pagination.cursor || ''),
      maxCursorB64: String(pagination.maxCursor || '')
    },
    cred
  );
}

async function testProtoInferCli(): Promise<void> {
  section('Mò proto từ file .bin');
  const argPath = process.argv[3];
  const p = argPath || process.env.TIKTOK_AWEME_V2_RESPONSE || path.join(repoRoot, 'storage', 'cookies', 'tiktok_aweme_v2_feed_response.bin');
  if (!(await fs.pathExists(p))) throw new Error(`Không có file: ${p}`);
  const u8 = new Uint8Array(await fs.readFile(p));
  const inf = inferAwemeV2Response(u8);
  console.log(JSON.stringify(inf, null, 2));
  try {
    const parsed = parseAwemeV2FeedResponse(u8);
    console.log('status_code:', parsed.status_code, 'items:', parsed.aweme_list?.length ?? 0);
  } catch (e: unknown) {
    console.log('(Không parse được như feed response:', asErrorMessage(e), ')');
  }
}

async function main(): Promise<void> {
  const mode = (process.argv[2] || '').toLowerCase();
  if (mode === 'help' || mode === '-h' || mode === '--help') return printHelp();
  if (mode === 'proto') return testProtoInferCli();
  if (mode === 'resp') return testRespOnly();
  if (mode === 'post' || mode === 'curl') return testPostCapture();
  await testSigner();
  await testProtobufPath();
  if (mode === 'lite') return testLiteFeed();
  if (mode === 'auto') return testAutoFeed();
  if (mode === 'v2' || mode === 'aweme') return testV2Feed();
  if (mode && !['lite', 'auto', 'v2', 'aweme', 'resp', 'post', 'curl', 'proto', 'help', '-h', '--help'].includes(mode)) {
    throw new Error(`Không rõ mode: ${mode}`);
  }
  console.log('\n── Gợi ý ──');
}

main().catch((e: unknown) => {
  console.error(asErrorMessage(e));
  process.exit(1);
});
