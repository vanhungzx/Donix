"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import fs from "fs-extra";
import path from "path";


const builtInQuotes: Record<string, string[]> = {
  motivation: [
    "Thành công không phải là đích đến cuối cùng, thất bại cũng không phải là chết chóc. Điều quan trọng là có can đảm để tiếp tục. - Winston Churchill",
    "Cách duy nhất để làm tốt công việc là yêu thích những gì bạn làm. - Steve Jobs",
    "Đừng để ngày hôm qua chiếm quá nhiều ngày hôm nay. - Will Rogers",
    "Bạn không thể kết nối các dấu chấm khi nhìn về phía trước; bạn chỉ có thể kết nối chúng khi nhìn lại. - Steve Jobs",
    "Hãy sống như thể ngày mai bạn sẽ chết. Hãy học như thể bạn sẽ sống mãi mãi. - Mahatma Gandhi",
    "Cuộc sống là những gì xảy ra với bạn trong khi bạn đang bận lập kế hoạch. - John Lennon",
    "Hãy là chính mình; mọi người khác đã được lấy rồi. - Oscar Wilde",
    "Hai mươi năm sau, bạn sẽ thất vọng về những điều bạn không làm hơn là những điều bạn đã làm. - Mark Twain",
    "Thành công là đi từ thất bại này đến thất bại khác mà không mất đi nhiệt huyết. - Winston Churchill",
    "Người ta thường nói rằng động lực không tồn tại lâu. Vâng, cũng như việc tắm rửa - đó là lý do tại sao chúng ta khuyến nghị làm điều đó hàng ngày. - Zig Ziglar"
  ],
  love: [
    "Tình yêu không phải là tìm một người hoàn hảo, mà là học cách nhìn một người không hoàn hảo một cách hoàn hảo. - Sam Keen",
    "Tình yêu đích thực là khi bạn đặt hạnh phúc của người khác lên trên hạnh phúc của chính mình. - H. Jackson Brown Jr.",
    "Tình yêu là khi hạnh phúc của người khác quan trọng hơn hạnh phúc của chính bạn. - H. Jackson Brown Jr.",
    "Tình yêu không phải là nhìn vào mắt nhau, mà là cùng nhìn về một hướng. - Antoine de Saint-Exupéry",
    "Tình yêu là một lựa chọn bạn đưa ra mỗi ngày. - Unknown",
    "Tình yêu không phải là tìm người bạn có thể sống cùng, mà là tìm người bạn không thể sống thiếu. - Rafael Ortiz",
    "Tình yêu đích thực là khi bạn chấp nhận một người với tất cả những gì họ có và không có. - Unknown"
  ],
  success: [
    "Thành công là tổng của những nỗ lực nhỏ được lặp lại ngày qua ngày. - Robert Collier",
    "Đừng mong đợi cơ hội, hãy tạo ra chúng. - George Bernard Shaw",
    "Thành công không phải là cuối cùng, thất bại không phải là chết người: đó là can đảm để tiếp tục mới quan trọng. - Winston Churchill",
    "Thành công thường đến với những người dám hành động, và hiếm khi đến với những kẻ nhút nhát. - Indira Gandhi",
    "Cơ hội không đến với những người chờ đợi. Nó đến với những người dám hành động. - Unknown",
    "Thành công là khả năng đi từ thất bại này đến thất bại khác mà không mất đi nhiệt huyết. - Winston Churchill",
    "Đừng bao giờ từ bỏ ước mơ của bạn chỉ vì thời gian thực hiện chúng lâu hơn bạn nghĩ. Thời gian sẽ trôi qua dù sao đi nữa. - Earl Nightingale"
  ],
  life: [
    "Cuộc sống là 10% những gì xảy ra với bạn và 90% cách bạn phản ứng với nó. - Charles R. Swindoll",
    "Cuộc sống thật ngắn ngủi. Hãy sống đam mê. Hãy tha thứ nhanh chóng. Hãy yêu thật lòng. - Unknown",
    "Cuộc sống không phải là tìm chính mình. Cuộc sống là tạo ra chính mình. - George Bernard Shaw",
    "Cuộc sống là một cuộc hành trình, không phải là đích đến. - Ralph Waldo Emerson",
    "Hãy sống như thể ngày mai bạn sẽ chết. Hãy học như thể bạn sẽ sống mãi mãi. - Mahatma Gandhi",
    "Cuộc sống là những gì xảy ra với bạn trong khi bạn đang bận lập kế hoạch. - John Lennon",
    "Đừng đếm những ngày, hãy làm cho những ngày đếm. - Muhammad Ali"
  ],
  wisdom: [
    "Kiến thức nói, nhưng sự khôn ngoan lắng nghe. - Jimi Hendrix",
    "Sự khôn ngoan bắt đầu từ sự ngạc nhiên. - Socrates",
    "Người khôn ngoan học từ những sai lầm của người khác. - Publilius Syrus",
    "Sự khôn ngoan không phải là tích lũy thông tin, mà là hiểu biết về bản chất của cuộc sống. - Unknown",
    "Người khôn ngoan không bao giờ làm điều gì đó mà họ không muốn làm. - Unknown"
  ]
};


import path from "path";
import { storagePath } from "../../../core/storagePath";

const quoteStoragePath = storagePath("other", "daily_quotes.json");

interface QuoteStorage {
  lastDate: string;
  lastQuotes: Record<string, string[]>; 
}

let quoteStorage: QuoteStorage = {
  lastDate: "",
  lastQuotes: {}
};


async function loadStorage(): Promise<void> {
  try {
    await fs.ensureDir(path.dirname(quoteStoragePath));
    if (await fs.pathExists(quoteStoragePath)) {
      const data = await fs.readJson(quoteStoragePath);
      quoteStorage = { ...quoteStorage, ...data };
    }
  } catch (e) {
    console.error("Error loading quote storage:", e);
  }
}


async function saveStorage(): Promise<void> {
  try {
    await fs.writeJson(quoteStoragePath, quoteStorage, { spaces: 2 });
  } catch (e) {
    console.error("Error saving quote storage:", e);
  }
}


async function fetchQuoteFromAPI(): Promise<string | null> {
  try {
    
    const response = await axios.get("https://zenquotes.io/api/random", {
      timeout: 5000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const quote = response.data[0];
      if (quote.q && quote.a) {
        return `"${quote.q}" - ${quote.a}`;
      }
    }
  } catch (e) {
    
  }

  return null;
}


function getBuiltInQuote(category: string = "motivation"): string {
  const normalizedCategory = category.toLowerCase();
  const quotes = builtInQuotes[normalizedCategory] || builtInQuotes.motivation;
  if (!quotes || quotes.length === 0) {
    return "Hãy sống đẹp mỗi ngày!";
  }
  const randomIndex = Math.floor(Math.random() * quotes.length);
  return quotes[randomIndex] || quotes[0] || "Hãy sống đẹp mỗi ngày!";
}


function isQuoteUsed(threadID: string, quote: string): boolean {
  const today = new Date().toDateString();

  
  if (quoteStorage.lastDate !== today) {
    quoteStorage.lastDate = today;
    quoteStorage.lastQuotes = {};
  }

  const usedQuotes = quoteStorage.lastQuotes[threadID] || [];
  return usedQuotes.includes(quote);
}


function markQuoteUsed(threadID: string, quote: string): void {
  const today = new Date().toDateString();

  if (quoteStorage.lastDate !== today) {
    quoteStorage.lastDate = today;
    quoteStorage.lastQuotes = {};
  }

  if (!quoteStorage.lastQuotes[threadID]) {
    quoteStorage.lastQuotes[threadID] = [];
  }

  quoteStorage.lastQuotes[threadID].push(quote);

  
  if (quoteStorage.lastQuotes[threadID].length > 50) {
    quoteStorage.lastQuotes[threadID] = quoteStorage.lastQuotes[threadID].slice(-50);
  }
}


async function getQuote(category: string = "motivation", threadID: string): Promise<string> {
  let quote: string | null = null;
  let attempts = 0;
  const maxAttempts = 10;

  
  quote = await fetchQuoteFromAPI();

  
  if (!quote || isQuoteUsed(threadID, quote)) {
    while (attempts < maxAttempts) {
      quote = getBuiltInQuote(category);
      if (quote && !isQuoteUsed(threadID, quote)) {
        break;
      }
      attempts++;
    }
  }

  
  if (!quote) {
    quote = getBuiltInQuote(category);
  }

  
  const finalQuote = quote || "Hãy sống đẹp mỗi ngày!";
  markQuoteUsed(threadID, finalQuote);
  await saveStorage();

  return finalQuote;
}

const quoteCommand: Command = {
  name: "quote",
  alias: ["trichdan", "cautruyen", "dailyquote", "qd"],
  version: "1.0.0",
  role: 0,
  desc: "Xem trích dẫn truyền cảm hứng hàng ngày",
  guide:
    "   {pn} [chủ đề]\n\n" +
    "   📚 Chủ đề có sẵn:\n" +
    "   • motivation / dongluc - Động lực\n" +
    "   • love / tinhyeu - Tình yêu\n" +
    "   • success / thanhcong - Thành công\n" +
    "   • life / cuocsong - Cuộc sống\n" +
    "   • wisdom / khonngoan - Trí tuệ\n" +
    "   • random / ngẫunhiên - Ngẫu nhiên\n\n" +
    "   Ví dụ:\n" +
    "   • {pn} - Lấy quote động lực mặc định\n" +
    "   • {pn} love - Lấy quote về tình yêu\n" +
    "   • {pn} success - Lấy quote về thành công",
  cd: 3,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply } = ctx;

    try {
      
      await loadStorage();

      const category = args[0]?.toLowerCase() || "motivation";
      const threadID = String(event.threadID);

      
      const categoryMap: Record<string, string> = {
        "dongluc": "motivation",
        "động lực": "motivation",
        "tinhyeu": "love",
        "tình yêu": "love",
        "thanhcong": "success",
        "thành công": "success",
        "cuocsong": "life",
        "cuộc sống": "life",
        "khonngoan": "wisdom",
        "khôn ngoan": "wisdom",
        "trí tuệ": "wisdom",
        "ngaunhien": "random",
        "ngẫu nhiên": "random"
      };

      const normalizedCategory = categoryMap[category] || category;

      
      let finalCategory: string = normalizedCategory;
      if (normalizedCategory === "random") {
        const categories = Object.keys(builtInQuotes);
        if (categories.length > 0) {
          const randomCategory = categories[Math.floor(Math.random() * categories.length)];
          finalCategory = randomCategory || "motivation";
        } else {
          finalCategory = "motivation";
        }
      }

      await reply({
        body: "💭 Đang tìm trích dẫn hay cho bạn..."
      });

      const quote = await getQuote(finalCategory, threadID);

      const categoryNames: Record<string, string> = {
        "motivation": "💪 Động lực",
        "love": "❤️ Tình yêu",
        "success": "🎯 Thành công",
        "life": "🌱 Cuộc sống",
        "wisdom": "🧠 Trí tuệ"
      };

      const categoryName = categoryNames[finalCategory] || "✨ Trích dẫn";

      await reply({
        body: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${categoryName}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `${quote}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 Gõ {pn} [chủ đề] để xem thêm trích dẫn khác!`
      });

    } catch (e: any) {
      console.error("Quote command error:", e);
      await reply({
        body: `❌ Đã xảy ra lỗi: ${e.message || "Lỗi không xác định"}\n` +
          `💡 Đang sử dụng trích dẫn tích hợp sẵn...`
      });

      
      try {
        const category = args[0]?.toLowerCase() || "motivation";
        const quote = getBuiltInQuote(category);

        await reply({
          body: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `✨ Trích dẫn\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `${quote}`
        });
      } catch (fallbackError) {
        await reply({
          body: "❌ Không thể tải trích dẫn. Vui lòng thử lại sau!"
        });
      }
    }
  },
};

export default quoteCommand;
