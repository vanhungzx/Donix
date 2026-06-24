import formatterUtils from "./formatters/index.js";
import { getExtension } from "./formatters/data/formatAttachment.js";

const formatters = {
  ...formatterUtils,
  getExtension,
};

export default formatters;
export * from "./formatters/index.js";
export { getExtension };
