import TiktokService from './services/tiktok.service.js';
import { TIKTOK_API_URL } from './constants/index.js';
import tiktokUtils, { findValueByKey } from './utils/tiktok.util.js';
import { Argus } from './tiktok-signer/argus.js';
import { ByteBuf } from './tiktok-signer/bytebuf.js';
import { Gorgon } from './tiktok-signer/gorgon.js';
import { Ladon } from './tiktok-signer/ladon.js';
import {
  ProtoBuf,
  ProtoError,
  ProtoField,
  ProtoFieldType,
  ProtoReader,
  ProtoWriter
} from './tiktok-signer/protobuf.js';
import createMobileHeadersSignature, {
  getBaseMobileParams,
  getTrillFeedBaseParams,
  TRILL_DEFAULT_LICENSE_ID
} from './tiktok-signer/signHeadersMobile.js';
import { simonDec, simonEnc } from './tiktok-signer/simon.js';
import { SM3 } from './tiktok-signer/sm3.js';
import { parseAwemeV2FeedResponse } from './utils/awemeV2ProtoParser.js';
import { decodeGorgon0404, decodeGorgon8404 } from './utils/gorgonInspect.js';
import { formatProtoFields, formatProtoValue } from './utils/protoWireFormat.js';

export default TiktokService;
export {
  TIKTOK_API_URL,
  tiktokUtils,
  findValueByKey,
  Argus,
  ByteBuf,
  Gorgon,
  Ladon,
  ProtoBuf,
  ProtoError,
  ProtoField,
  ProtoFieldType,
  ProtoReader,
  ProtoWriter,
  createMobileHeadersSignature,
  getBaseMobileParams,
  getTrillFeedBaseParams,
  TRILL_DEFAULT_LICENSE_ID,
  simonDec,
  simonEnc,
  SM3,
  parseAwemeV2FeedResponse,
  decodeGorgon0404,
  decodeGorgon8404,
  formatProtoFields,
  formatProtoValue
};
