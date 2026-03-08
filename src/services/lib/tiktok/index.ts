import TiktokService from './services/tiktok.service.js'
import { TIKTOK_API_URL } from './constants/index.js'
import tiktokUtils, { findValueByKey } from './utils/tiktok.util.js'
import { Argus } from './tiktok-signer/argus.js'
import { ByteBuf } from './tiktok-signer/bytebuf.js'
import { Gorgon } from './tiktok-signer/gorgon.js'
import { Ladon } from './tiktok-signer/ladon.js'
import {
  ProtoBuf,
  ProtoError,
  ProtoField,
  ProtoFieldType,
  ProtoReader,
  ProtoWriter
} from './tiktok-signer/protobuf.js'
import createMobileHeadersSignature, { getBaseMobileParams } from './tiktok-signer/signHeadersMobile.js'
import { simonDec, simonEnc } from './tiktok-signer/simon.js'
import { SM3 } from './tiktok-signer/sm3.js'

export default TiktokService
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
  simonDec,
  simonEnc,
  SM3
}

export * from './types/index.js'
