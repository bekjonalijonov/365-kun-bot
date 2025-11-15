// index.js
// =========================================
//  Yangi Odat 🌱 — 365 Kunlik G‘oyalar Bot
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

if (!BOT_TOKEN || !CHANNEL_ID || !START_DATE) {
  console.error("❌ .env da BOT_TOKEN, CHANNEL_ID yoki START_DATE yo‘q.");
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
      "1": [], "2": [], "3": [], "4": [],
      "5": [], "6": [], "7": [], "8": [],
      "9": [], "10": [], "11": [], "12": []
    };
    fs.writeFileSync(f, JSON.stringify(empty, null, 2));
    return empty;
  }

  return loadJsonSafe("archive.json", {
    "1": [], "2": [], "3": [], "4": [],
    "5": [], "6": [], "7": [], "8": [],
    "9": [], "10": [], "11": [], "12": []
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
  let d = Math.floor((date - s) / 86400000) + 1;

  if (d < 1) d = 1;
  if (d > 365) d = ((d - 1) % 365) + 1;

  return d;
}

const getMonthFromDay = (d) => Math.ceil(d / 30);
const getIdea = (d) => ideas.find((x) => x.day === d);
const getTasks = (d) => tasks.find((x) => x.day === d)?.tasks || [];
const getTelegraphUrl = (d) =>
  telegraphLinks.find((x) => x.day === d)?.url || null;

// Arxiv uchun: barcha yuborilgan kunlar
function getAllSentDays() {
  const all = [];
  Object.values(archive).forEach((arr) => all.push(...arr));
  return [...new Set(all)].sort((a, b) => a - b);
}

// Arxiv uchun tugmalar
function buildArchiveKeyboard() {
  const days = getAllSentDays();
  const rows = [];
  let row = [];

  days.forEach((d) => {
    const url = getTelegraphUrl(d);
    if (!url) return;

    row.push({ text: `Kun ${d}`, url });

    if (row.length === 3) {
      rows.push(row);
      row = [];
    }
  });

  if (row.length) rows.push(row);

  // Orqaga tugmasi
  rows.push([{ text: "⬅️ Orqaga", callback_data: "close_archive" }]);

  return rows;
}

// ------------------------ DAILY POST ---------------------
async function sendDailyPost(chatId, date = new Date()) {
  const day = getDayNumber(date);
  const idea = getIdea(day);

  if (!idea) {
    console.warn(`⚠️ ${day}-kunning g‘oyasi topilmadi.`);
    return;
  }

  const url = getTelegraphUrl(day);

  const txt =
    `📘 Kun ${day}/365\n` +
    `“${idea.title}”\n\n` +
    `${idea.short}\n\n──────────\n👇 Batafsil o‘qish:`;

  const inline_keyboard = [];

  if (url) inline_keyboard.push([{ text: "🔍 Batafsil", url }]);
  inline_keyboard.push([{ text: "📚 Arxiv", callback_data: "open_archive" }]);

  await bot.sendMessage(chatId, txt, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard }
  });

  // Mini vazifa
  const t = getTasks(day);
  if (t.length > 0) {
    const taskTxt =
      `🧠 Bugungi mini vazifa:\n\n` +
      t.map((v, i) => `${i + 1}) ${v}`).join("\n") +
      `\n\n#MiniVazifa #Kun${day}`;

    await bot.sendMessage(chatId, taskTxt, { parse_mode: "Markdown" });
  }

  // Arxivga yozamiz
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

  // ARXIV OCHISH
  if (data === "open_archive") {
    const keyboard = buildArchiveKeyboard();

    if (keyboard.length === 1) { // faqat orqaga tugmasi bo‘lsa
      return bot.answerCallbackQuery(q.id, {
        text: "Hali arxiv bo‘sh.",
        show_alert: true
      });
    }

    // Yangi xabar sifatida chiqadi
    await bot.sendMessage(chatId, "📚 Arxiv — o‘qilgan kunlar:", {
      reply_markup: { inline_keyboard: keyboard }
    });

    return bot.answerCallbackQuery(q.id);
  }

  // ARXIV YOPISH (xabarni o‘chiradi)
  if (data === "close_archive") {
    bot.deleteMessage(chatId, q.message.message_id);
    return bot.answerCallbackQuery(q.id);
  }
});

// ------------------------ SCHEDULE -----------------------
// Har kuni soat 05:00 da kanalga post yuborish
// Agar test uchun vaqtni o‘zgartirmoqchi bo‘lsang:
// schedule.scheduleJob("0 20 19 * * *", ...)  // 19:20 da test
schedule.scheduleJob("0 37 20 * * *", () => {
  const now = new Date();
  console.log("⏰ Kunlik post vaqti:", now.toISOString());
  sendDailyPost(CHANNEL_ID, now);
});

// ------------------------ TEST KOMANDALAR -----------------
bot.onText(/\/test_today/, (msg) => {
  sendDailyPost(msg.chat.id, new Date());
});

bot.onText(/\/test_archive/, (msg) => {
  const keyboard = buildArchiveKeyboard();
  bot.sendMessage(msg.chat.id, "📚 Arxiv (test):", {
    reply_markup: { inline_keyboard: keyboard }
  });
});

bot.onText(/\/test_day_(\d+)/, (msg, match) => {
  const d = Number(match[1]);
  const url = getTelegraphUrl(d);

  if (!url) return bot.sendMessage(msg.chat.id, "Link yo‘q");

  bot.sendMessage(msg.chat.id, `📘 Kun ${d}\n👉 ${url}`);
});
