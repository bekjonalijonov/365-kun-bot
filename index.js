// index.js
// =========================================
//  Yangi Odat 🌱 — 365 Kunlik G'oyalar Bot
//  PREMIUM ARXIV (faqat yuborilgan kunlar)
//  Node >= 20, "type": "module"
// =========================================

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import TelegramBot from "node-telegram-bot-api";
import schedule from "node-schedule";

// ------------------------ PATH HELPER --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = (file) => path.join(__dirname, "data", file);

// ------------------------ ENV ---------------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const START_DATE = process.env.START_DATE;
const TIMEZONE = process.env.TIMEZONE || "Asia/Tashkent"; // hozircha faqat ma'lumot uchun

if (!BOT_TOKEN || !CHANNEL_ID || !START_DATE) {
  console.error("❌ .env da BOT_TOKEN, CHANNEL_ID yoki START_DATE yo'q.");
  process.exit(1);
}

// ------------------------ BOT INIT -----------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("✅ Bot ishga tushdi...");

// ------------------------ JSON LOAD -----------------------
function loadJsonSafe(file, def) {
  try {
    return JSON.parse(fs.readFileSync(dataPath(file), "utf-8"));
  } catch {
    console.warn(`⚠️ ${file} topilmadi → default ishlatiladi.`);
    return def;
  }
}

// ------------------------ ARCHIVE INIT -------------------
function initArchive() {
  const f = dataPath("archive.json");

  if (!fs.existsSync(f)) {
    console.log("📦 archive.json yaratildi.");
    const empty = {
      "1": [],
      "2": [],
      "3": [],
      "4": [],
      "5": [],
      "6": [],
      "7": [],
      "8": [],
      "9": [],
      "10": [],
      "11": [],
      "12": []
    };
    fs.writeFileSync(f, JSON.stringify(empty, null, 2));
    return empty;
  }

  return loadJsonSafe("archive.json", {
    "1": [],
    "2": [],
    "3": [],
    "4": [],
    "5": [],
    "6": [],
    "7": [],
    "8": [],
    "9": [],
    "10": [],
    "11": [],
    "12": []
  });
}

let ideas = loadJsonSafe("ideas.json", []);
let tasks = loadJsonSafe("tasks.json", []);
let telegraphLinks = loadJsonSafe("telegraph_links.json", []);
let archive = initArchive();

function saveArchive() {
  fs.writeFileSync(dataPath("archive.json"), JSON.stringify(archive, null, 2));
}

// ------------------------ HELPERS ------------------------
function getDayNumber(date = new Date()) {
  const s = new Date(START_DATE + "T00:00:00");
  let d = Math.floor((date - s) / (1000 * 60 * 60 * 24)) + 1;

  if (d < 1) d = 1;
  if (d > 365) d = ((d - 1) % 365) + 1;

  return d;
}

const getMonthFromDay = (d) => Math.ceil(d / 30);
const getIdea = (d) => ideas.find((x) => x.day === d);
const getTasks = (d) => tasks.find((x) => x.day === d)?.tasks || [];
const getTelegraphUrl = (d) =>
  telegraphLinks.find((x) => x.day === d)?.url || null;

// Arxiv uchun: barcha yuborilgan kunlar ro'yxatini olish
function getAllSentDays() {
  const all = [];
  for (const key of Object.keys(archive)) {
    all.push(...archive[key]);
  }
  // dublikatlarni olib tashlaymiz va sort qilamiz
  return Array.from(new Set(all)).sort((a, b) => a - b);
}

// Arxiv tugmalari (faqat yuborilgan va linki bor kunlar)
function buildArchiveKeyboard() {
  const days = getAllSentDays();
  const rows = [];
  let row = [];

  days.forEach((d) => {
    const url = getTelegraphUrl(d);
    if (!url) return; // link bo'lmasa tugma chiqarmaymiz

    row.push({
      text: `Kun ${d}`,
      url
    });

    if (row.length === 3) {
      rows.push(row);
      row = [];
    }
  });

  if (row.length) rows.push(row);

  return rows;
}

// ------------------------ DAILY POST ---------------------
async function sendDailyPost(chatId, date = new Date()) {
  const day = getDayNumber(date);
  const idea = getIdea(day);

  if (!idea) {
    console.warn(`⚠️ ${day}-kunning g‘oyasi ideas.json da topilmadi.`);
    return;
  }

  const url = getTelegraphUrl(day);

  const txt =
    `📘 Kun ${day}/365\n` +
    `“${idea.title}”\n\n` +
    `${idea.short}\n\n──────────\n👇 Batafsil o‘qish:`;

  const inline_keyboard = [];

  if (url) {
    inline_keyboard.push([{ text: "🔍 Batafsil", url }]);
  } else {
    inline_keyboard.push([
      {
        text: "🔍 Batafsil link topilmadi",
        callback_data: "no_link"
      }
    ]);
  }

  inline_keyboard.push([
    { text: "📚 Arxiv", callback_data: "open_archive" }
  ]);

  await bot.sendMessage(chatId, txt, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard }
  });

  // MINI VAZIFA
  const t = getTasks(day);
  if (t.length > 0) {
    const taskTxt =
      `🧠 Bugungi mini vazifa:\n\n` +
      t.map((v, i) => `${i + 1}) ${v}`).join("\n") +
      `\n\n#MiniVazifa #Kun${day}`;

    await bot.sendMessage(chatId, taskTxt, { parse_mode: "Markdown" });
  } else {
    console.warn(`⚠️ ${day}-kun uchun tasks.json da mini vazifa topilmadi.`);
  }

  // ARXIVGA YOZILADI (faqat yuborilgan kunlar chiqishi uchun)
  const month = getMonthFromDay(day);
  if (!archive[month].includes(day)) {
    archive[month].push(day);
    archive[month].sort((a, b) => a - b);
    saveArchive();
  }

  console.log("✅ Yuborildi va arxivga qo‘shildi:", day);
}

// ------------------------ ARXIV MENYU ---------------------
bot.on("callback_query", async (q) => {
  const data = q.data;
  const chatId = q.message.chat.id;

  if (data === "no_link") {
    return bot.answerCallbackQuery(q.id, {
      text: "Bu kun uchun Telegraph linki topilmadi.",
      show_alert: true
    });
  }

  // 📚 ASOSIY ARXIV — faqat yuborilgan kunlar ro'yxati
  if (data === "open_archive") {
    const keyboard = buildArchiveKeyboard();

    if (!keyboard.length) {
      return bot.answerCallbackQuery(q.id, {
        text: "Hali arxivda birorta yuborilgan kun yo‘q.",
        show_alert: true
      });
    }

    await bot.editMessageText("📚 Arxiv — o‘qilgan kunlardan birini tanlang:", {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: keyboard }
    });

    return bot.answerCallbackQuery(q.id);
  }
});

// ------------------------ SCHEDULE -----------------------
// Har kuni soat 05:00 da kanalga post yuborish
schedule.scheduleJob("0 0 5 * * *", () => {
  const now = new Date();
  console.log("⏰ Kunlik post vaqti:", now.toISOString());
  sendDailyPost(CHANNEL_ID, now);
});

// ------------------------ TEST KOMANDALAR -----------------
// Faqat o'zing sinab ko'rish uchun

// Bugungi kunga mos postni hozir yuborish
bot.onText(/\/test_today/, (msg) => {
  const chatId = msg.chat.id;
  sendDailyPost(chatId, new Date());
});

// Arxiv menyusini ko'rish (allaqachon yuborilgan kunlar tugmalari)
bot.onText(/\/test_archive/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = buildArchiveKeyboard();

  if (!keyboard.length) {
    return bot.sendMessage(chatId, "Hali arxivda birorta kun yo‘q.");
  }

  bot.sendMessage(chatId, "📚 Arxiv — o‘qilgan kunlar:", {
    reply_markup: { inline_keyboard: keyboard }
  });
});

// Muayyan kun uchun linkni test qilish: /test_day_7
bot.onText(/\/test_day_(\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const day = Number(match[1]);
  const url = getTelegraphUrl(day);

  if (!url) {
    return bot.sendMessage(chatId, `Kun ${day} uchun link topilmadi.`);
  }

  bot.sendMessage(chatId, `📘 Kun ${day}\n👉 ${url}`);
});
