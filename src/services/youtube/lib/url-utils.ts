const validQueryDomains = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "gaming.youtube.com",
]);

const validPathDomains =
  /^https?:\/\/(youtu\.be\/|(www\.)?youtube\.com\/(embed|v|shorts|live)\/)/;
const urlRegex = /^https?:\/\//;
const idRegex = /^[a-zA-Z0-9-_]{11}$/;

export const getURLVideoID = (link: string): string => {
  const parsed = new URL(link.trim());
  let id = parsed.searchParams.get("v");
  if (validPathDomains.test(link.trim()) && !id) {
    const paths = parsed.pathname.split("/");
    id = parsed.host === "youtu.be" ? paths[1] : paths[2];
  } else if (parsed.hostname && !validQueryDomains.has(parsed.hostname)) {
    throw Error("Not a YouTube domain");
  }
  if (!id) {
    throw Error(`No video id found: "${link}"`);
  }
  id = id.substring(0, 11);
  if (!validateID(id)) {
    throw TypeError(`Video id (${id}) does not match expected format (${idRegex.toString()})`);
  }
  return id;
};

export const getVideoID = (input: string): string => {
  if (validateID(input)) {
    return input;
  }
  if (urlRegex.test(input.trim())) {
    return getURLVideoID(input);
  }
  throw Error(`No video id found: ${input}`);
};

export const validateID = (id: string): boolean => idRegex.test(id.trim());

export const validateURL = (input: string): boolean => {
  try {
    getURLVideoID(input);
    return true;
  } catch {
    return false;
  }
};
