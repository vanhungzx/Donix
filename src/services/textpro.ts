import cheerio from "cheerio";
import FormData from "form-data";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { cookie } from "@utils/index";

interface TokenResult {
  token: string;
  cookie: string;
}

interface FormPayload {
  [key: string]: string | string[];
}

interface ImageResponse {
  fullsize_image: string;
  [key: string]: any;
}

class TextPro {
  private baseUrl: string;
  private outputDir: string;

  constructor() {
    this.baseUrl = "https://textpro.me";
    this.outputDir = join(process.cwd(), "temp");

    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private parseCookies(setCookie: string): string {
    const raw = setCookie.split(";").map((v) => cookie.parse(v));
    const combined = Object.assign({}, ...raw);
    const phpsessid = combined.PHPSESSID;
    return cookie.serialize("PHPSESSID", phpsessid);
  }

  private async getToken(pageUrl: string): Promise<TokenResult> {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Referer: pageUrl,
      },
    });

    const html = await res.text();
    const setCookieHeader = res.headers.get("set-cookie");

    if (!setCookieHeader) {
      throw new Error("Không lấy được cookie!");
    }

    const jar = this.parseCookies(setCookieHeader);
    const $ = cheerio.load(html);
    const token = $('input[name="token"]').attr("value");

    if (!token) {
      throw new Error("Không lấy được token!");
    }

    return { token, cookie: jar };
  }

  private async submitForm(
    pageUrl: string,
    textArr: string[],
    token: string,
    cookieJar: string
  ): Promise<FormPayload> {
    const form = new FormData();

    textArr.forEach((txt) => form.append("text[]", txt));
    form.append("submit", "Go");
    form.append("token", token);
    form.append("build_server", this.baseUrl);
    form.append("build_server_id", "1");

    const response = await fetch(pageUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Cookie: cookieJar,
        ...form.getHeaders(),
      },
      body: form.getBuffer(),
    });

    const html = await response.text();
    const match = /<div.*?id="form_value".+?>(.*?)<\/div>/.exec(html);

    if (!match) {
      throw new Error("Không lấy được dữ liệu ảnh!");
    }

    return JSON.parse(match[1]);
  }

  private async renderImage(
    data: FormPayload,
    cookieJar: string
  ): Promise<string> {
    const query = Object.entries(data)
      .map(([k, v]) => {
        if (Array.isArray(v)) {
          return v
            .map((val) => `${k}[]=${encodeURIComponent(val)}`)
            .join("&");
        }
        return `${k}=${encodeURIComponent(v)}`;
      })
      .join("&");

    const res = await fetch(`${this.baseUrl}/effect/create-image?${query}`, {
      headers: {
        "User-Agent": "GoogleBot",
        Cookie: cookieJar,
      },
    });

    const json = (await res.json()) as ImageResponse;

    if (!json.fullsize_image) {
      throw new Error("Không lấy được dữ liệu ảnh!");
    }

    const imageRes = await fetch(`${this.baseUrl}${json.fullsize_image}`, {
      headers: {
        "User-Agent": "GoogleBot",
        Cookie: cookieJar,
      },
    });

    const buffer = await imageRes.arrayBuffer();
    const filename = `textpro_${Date.now()}.png`;
    const filepath = join(this.outputDir, filename);

    writeFileSync(filepath, Buffer.from(buffer));

    return filepath;
  }

  async createImage(
    link: string,
    content: string | string[]
  ): Promise<string> {
    if (!/^https:\/\/textpro\.me\/.+\.html$/.test(link)) {
      throw new Error("URL không hợp lệ!");
    }

    if (typeof content === "string") {
      content = [content];
    }

    const { token, cookie: cookieJar } = await this.getToken(link);
    const payload = await this.submitForm(link, content, token, cookieJar);

    return await this.renderImage(payload, cookieJar);
  }
}

const textPro = new TextPro();

export default textPro.createImage.bind(textPro);
