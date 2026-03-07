import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDIA_DIR = path.join(__dirname, "..", "..", "storage", "media");

function getMediaFiles(folderName: string): string[] {
  const folderPath = path.join(MEDIA_DIR, folderName);

  if (!fs.existsSync(folderPath)) {
    return [];
  }

  try {
    const files = fs.readdirSync(folderPath, { withFileTypes: true });
    return files
      .filter(file => file.isFile())
      .map(file => path.join(folderPath, file.name));
  } catch (error) {
    return [];
  }
}

function getAvailableFolders(): string[] {
  if (!fs.existsSync(MEDIA_DIR)) {
    return [];
  }

  try {
    const items = fs.readdirSync(MEDIA_DIR, { withFileTypes: true });
    return items
      .filter(item => item.isDirectory())
      .map(item => item.name);
  } catch (error) {
    return [];
  }
}

const mediaService = new Proxy({} as Record<string, string[]>, {
  get(_target, prop: string) {
    if (typeof prop !== "string") {
      return undefined;
    }

    if (prop === "getFolders") {
      return getAvailableFolders;
    }
    if (prop === "getFiles") {
      return getMediaFiles;
    }

    return getMediaFiles(prop);
  },
  ownKeys() {
    return getAvailableFolders();
  },
  has(_target, prop: string) {
    if (typeof prop !== "string") return false;
    if (prop === "getFolders" || prop === "getFiles") return true;
    const folders = getAvailableFolders();
    return folders.includes(prop);
  },
  getOwnPropertyDescriptor() {
    return {
      enumerable: true,
      configurable: true,
    };
  },
});

export default mediaService;
