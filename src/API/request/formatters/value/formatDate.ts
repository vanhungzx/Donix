import { NUM_TO_DAY, NUM_TO_MONTH } from "../../constants.js";

const formatDate = (date: Date): string => {
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const m = date.getUTCMinutes();
  const s = date.getUTCSeconds();

  const dd = d >= 10 ? String(d) : `0${d}`;
  const hh = h >= 10 ? String(h) : `0${h}`;
  const mm = m >= 10 ? String(m) : `0${m}`;
  const ss = s >= 10 ? String(s) : `0${s}`;

  return `${NUM_TO_DAY[date.getUTCDay()]}, ${dd} ${NUM_TO_MONTH[date.getUTCMonth()]} ${date.getUTCFullYear()} ${hh}:${mm}:${ss} GMT`;
};

export default formatDate;
