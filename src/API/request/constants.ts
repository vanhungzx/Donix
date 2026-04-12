
const replacementMap = {
  _: "%",
  A: "%2",
  B: "000",
  C: "%7d",
  D: "%7b%22",
  E: "%2c%22",
  F: "%22%3a",
  G: "%2c%22ut%22%3a1",
  H: "%2c%22bls%22%3a",
  I: "%2c%22n%22%3a%22%",
  J: "%22%3a%7b%22i%22%3a0%7d",
  K: "%2c%22pt%22%3a0%2c%22vis%22%3a",
  L: "%2c%22ch%22%3a%7b%22h%22%3a%22",
  M: "%7b%22v%22%3a2%2c%22time%22%3a1",
  N: ".channel%22%2c%22sub%22%3a%5b",
  O: "%2c%22sb%22%3a1%2c%22t%22%3a%5b",
  P: "%2c%22ud%22%3a100%2c%22lc%22%3a0",
  Q: "%5d%2c%22f%22%3anull%2c%22uct%22%3a",
  R: ".channel%22%2c%22sub%22%3a%5b1%5d",
  S: "%22%2c%22m%22%3a0%7d%2c%7b%22i%22%3a",
  T: "%2c%22blc%22%3a1%2c%22snd%22%3a1%2c%22ct%22%3a",
  U: "%2c%22blc%22%3a0%2c%22snd%22%3a1%2c%22ct%22%3a",
  V: "%2c%22blc%22%3a0%2c%22snd%22%3a0%2c%22ct%22%3a",
  W: "%2c%22s%22%3a0%2c%22blo%22%3a0%7d%2c%22bl%22%3a%7b%22ac%22%3a",
  X: "%2c%22ri%22%3a0%7d%2c%22state%22%3a%7b%22p%22%3a0%2c%22ut%22%3a1",
  Y: "%2c%22pt%22%3a0%2c%22vis%22%3a1%2c%22bls%22%3a0%2c%22blc%22%3a0%2c%22snd%22%3a1%2c%22ct%22%3a",
  Z: "%2c%22sb%22%3a1%2c%22t%22%3a%5b%5d%2c%22f%22%3anull%2c%22uct%22%3a0%2c%22s%22%3a0%2c%22blo%22%3a0%7d%2c%22bl%22%3a%7b%22ac%22%3a",
} as const;

type ReplacementKey = keyof typeof replacementMap;

const replacementLookup: Record<string, ReplacementKey> = {};
let replacementRegex: RegExp;

(() => {
  const tokens: string[] = [];
  for (const key in replacementMap) {
    const token = replacementMap[key as ReplacementKey];
    replacementLookup[token] = key as ReplacementKey;
    tokens.push(token);
  }
  tokens.reverse();
  replacementRegex = new RegExp(tokens.join("|"), "g");
})();

const NUM_TO_MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const NUM_TO_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const padZeros = (val: string | number, len = 2): string => {
  let value = String(val);
  while (value.length < len) value = "0" + value;
  return value;
};

const generateThreadingID = (clientID: string): string => {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 4294967295);
  return `<${now}:${rand}-${clientID}@mail.projektitan.com>`;
};

const binaryToDecimal = (data: string): string => {
  let ret = "";
  let localData = data;
  while (localData !== "0") {
    let end = 0;
    let fullName = "";
    for (let idx = 0; idx < localData.length; idx++) {
      end = 2 * end + parseInt(localData[idx], 10);
      if (end >= 10) {
        fullName += "1";
        end -= 10;
      } else {
        fullName += "0";
      }
    }
    ret = end.toString() + ret;
    const nextIndex = fullName.indexOf("1");
    localData = nextIndex === -1 ? "0" : fullName.slice(nextIndex);
  }
  return ret;
};

const generateOfflineThreadingID = (): string => {
  const timestamp = Date.now();
  const value = Math.floor(Math.random() * 4294967295);
  const str = (`0000000000000000000000${value.toString(2)}`).slice(-22);
  return binaryToDecimal(timestamp.toString(2) + str);
};

const presenceEncode = (str: string): string =>
  encodeURIComponent(str)
    .replace(/([_A-Z])|%../g, (match, letter) =>
      letter ? `%${letter.charCodeAt(0).toString(16)}` : match
    )
    .toLowerCase()
    .replace(replacementRegex, (match) => replacementLookup[match]);

const presenceDecode = (str: string): string =>
  decodeURIComponent(
    str.replace(/[_A-Z]/g, (match) => replacementMap[match as ReplacementKey])
  );

const generatePresence = (userID: string): string => {
  const time = Date.now();
  return (
    "E" +
    presenceEncode(
      JSON.stringify({
        v: 3,
        time: Math.floor(time / 1000),
        user: userID,
        state: {
          ut: 0,
          t2: [],
          lm2: null,
          uct2: time,
          tr: null,
          tw: Math.floor(Math.random() * 4294967295) + 1,
          at: time,
        },
        ch: { [`p_${userID}`]: 0 },
      })
    )
  );
};

const generateAccessiblityCookie = (): string => {
  const time = Date.now();
  return encodeURIComponent(
    JSON.stringify({
      sr: 0,
      "sr-ts": time,
      jk: 0,
      "jk-ts": time,
      kb: 0,
      "kb-ts": time,
      hcm: 0,
      "hcm-ts": time,
    })
  );
};

const getGUID = (): string => {
  let sectionLength = Date.now();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor((sectionLength + Math.random() * 16) % 16);
    sectionLength = Math.floor(sectionLength / 16);
    const value = c === "x" ? r : (r & 7) | 8;
    return value.toString(16);
  });
};

const getFrom = (str: string, startToken: string, endToken: string): string => {
  const start = str.indexOf(startToken);
  if (start === -1) return "";
  const adjustedStart = start + startToken.length;
  const lastHalf = str.substring(adjustedStart);
  const end = lastHalf.indexOf(endToken);
  if (end === -1) {
    throw new Error(`Could not find endToken "${endToken}" in the given string.`);
  }
  return lastHalf.substring(0, end);
};

const makeParsable = (html: string): string => {
  const withoutForLoop = html.replace(/for\s*\(\s*;\s*;\s*\)\s*;\s*/, "");
  const maybeMultipleObjects = withoutForLoop.split(/\}\r\n *\{/);
  if (maybeMultipleObjects.length === 1) return maybeMultipleObjects[0];
  return `[${maybeMultipleObjects.join("},{")}]`;
};

const arrayToObject = <T, K extends string, V>(
  arr: T[],
  getKey: (val: T) => K,
  getValue: (val: T) => V
): Record<K, V> =>
  arr.reduce((acc, val) => {
    acc[getKey(val)] = getValue(val);
    return acc;
  }, {} as Record<K, V>);

const arrToForm = <T extends { name: string; val: unknown }>(form: T[]): Record<string, unknown> =>
  arrayToObject(
    form,
    (v) => v.name,
    (v) => v.val
  );

const getSignatureID = (): string =>
  Math.floor(Math.random() * 2147483648).toString(16);

const generateTimestampRelative = (): string => {
  const d = new Date();
  return `${d.getHours()}:${padZeros(d.getMinutes())}`;
};

const getType = (obj: unknown): string =>
  Object.prototype.toString.call(obj).slice(8, -1);

const constants = {
  getRandom,
  padZeros,
  generateThreadingID,
  binaryToDecimal,
  generateOfflineThreadingID,
  presenceEncode,
  presenceDecode,
  generatePresence,
  generateAccessiblityCookie,
  getGUID,
  getFrom,
  makeParsable,
  arrToForm,
  arrayToObject,
  getSignatureID,
  generateTimestampRelative,
  getType,
  NUM_TO_MONTH,
  NUM_TO_DAY,
};

export default constants;
export {
  arrayToObject, arrToForm, binaryToDecimal, generateAccessiblityCookie, generateOfflineThreadingID, generatePresence, generateThreadingID, generateTimestampRelative, getFrom, getGUID, getRandom, getSignatureID, getType, makeParsable, NUM_TO_DAY, NUM_TO_MONTH, padZeros, presenceDecode, presenceEncode
};
