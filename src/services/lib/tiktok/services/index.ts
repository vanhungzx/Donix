import { getCommentList } from './comment.service.js'
import { getFYPFeed } from './feed.service.js'
import { extractXttTokenFromCookie, getTiktokCredentials, searchUserIdByUsername } from './helpers.js'
import { searchItem, searchMusic, searchSingle, searchStream } from './search.service.js'
import { getUserAwemeList, getUserInfoByUsername } from './user.service.js'
import { getCredentials, resolveShortLink } from './utils.service.js'
import { getAwemeDetails, getMultiAwemeDetails } from './video.service.js'

// Use loose typing here to avoid TypeScript complaining about exported
// composite types that depend on many internal service result types.
const TiktokService: any = {
  getUserInfoByUsername,
  getUserAwemeList,
  getAwemeDetails,
  getMultiAwemeDetails,
  resolveShortLink,
  getFYPFeed,
  getCommentList,
  searchMusic,
  searchStream,
  searchSingle,
  searchItem,
  getCredentials,
}

export default TiktokService
export {
  getCommentList,
  getFYPFeed,
  extractXttTokenFromCookie,
  getTiktokCredentials,
  searchUserIdByUsername,
  searchItem,
  searchMusic,
  searchSingle,
  searchStream,
  getUserAwemeList,
  getUserInfoByUsername,
  getCredentials,
  resolveShortLink,
  getAwemeDetails,
  getMultiAwemeDetails
}
