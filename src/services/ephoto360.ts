"use strict";
import axios from "axios";
import cheerio from "cheerio";
import FormData from "form-data";

export interface MakerResult {
  status: boolean;
  image: string;
  session: string;
}

export default async function maker(
  url: string,
  text: string | string[]
): Promise<MakerResult> {
  if (/https?:\/\/(ephoto360|photooxy|textpro)\.(com|me)/i.test(url)) {
    throw new Error("URL không hợp lệ!");
  }

  try {
    const origin = new URL(url).origin;

    const a = await axios.get<string>(url, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        Origin: origin,
        Referer: url,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      },
    });

    let $ = cheerio.load(a.data);

    const server = String($("#build_server").val() || "");
    const serverId = Number($("#build_server_id").val() || 0);
    const token = String($("#token").val() || "");
    const submit = String($("#submit").val() || "");

    const types: string[] = [];
    $('input[name="radio0[radio]"]').each((_, el) => {
      const v = $(el).val();
      if (v) types.push(String(v));
    });

    const post: Record<string, any> = {
      submit,
      token,
      build_server: server,
      build_server_id: serverId,
    };

    if (types.length > 0) {
      post["radio0[radio]"] =
        types[Math.floor(Math.random() * types.length)];
    }

    const form = new FormData();
    for (const key in post) {
      form.append(key, post[key]);
    }

    if (typeof text === "string") {
      text = [text];
    }
    for (const t of text) {
      form.append("text[]", t);
    }

    const cookieHeader = (a.headers["set-cookie"] as string[]).join("; ");
    const b = await axios.post<string>(url, form, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        Origin: origin,
        Referer: url,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        Cookie: cookieHeader,
        ...form.getHeaders(),
      },
    });

    $ = cheerio.load(b.data);

    const out =
      $("#form_value").first().text() ||
      $("#form_value_input").first().text() ||
      String($("#form_value").first().val() || "") ||
      String($("#form_value_input").first().val() || "");
    const c = await axios.post<{
      success: boolean;
      fullsize_image?: string;
      image?: string;
      session_id: string;
    }>(`${origin}/effect/create-image`, JSON.parse(out), {
      headers: {
        Accept: "*/*",
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: origin,
        Referer: url,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        Cookie: cookieHeader,
      },
    });
    return {
      status: c.data?.success,
      image: server + (c.data?.fullsize_image || c.data?.image || ""),
      session: c.data?.session_id,
    };
  } catch (e) {
    throw e;
  }
}
