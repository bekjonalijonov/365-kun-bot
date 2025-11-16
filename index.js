// index.js
// =========================================
//  Yangi Odat 🌱 — 365 Kunlik G‘oyalar Bot
//  PREMIUM ARXIV (Oy → Kun, faqat yuborilgan kunlar)
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
const CHANNEL_ID = process.env.CHANNEL_ID;   // @channel yoki -100...
const START_DATE = process.env.START_DATE;   // "2025-01-01" format

if (!BOT_TOKEN || !CHANNEL_ID || !START_DATE) {
  console.error("❌ .env da BOT_TOKEN, CHANNEL_ID yoki START_DATE yo‘q.");
  process.exit(1);
}

// ------------------------ BOT INIT -----------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("✅ Bot ishga tushdi...");

// ------------------------ JSON LOAD HELPERS --------------
function loadJsonSafe(file, def) {
  try {
    const raw = fs.readFileSync(dataPath(file), "utf-8");
    return JSON.parse(raw);
  } catch {
    console.warn(`⚠️ ${file} topilmadi → default ishlatiladi.`);
    return def;
  }
}

// ------------------------ DATA LOAD ----------------------
let ideas = loadJsonSafe("ideas.json", []);               
let tasks = loadJsonSafe("tasks.json", []);               
let telegraphLinks = loadJsonSafe("telegraph_links.json", []); 

// ------------------------ ARCHIVE INIT -------------------
function initArchive() {
  const filePath = dataPath("archive.json");

  if (!fs.existsSync(filePath)) {
    console.log("📦 archive.json yaratildi (yangi).");
    const empty = {
      "1": [], "2": [], "3": [], "4": [],
      "5": [], "6": [], "7": [], "8": [],
      "9": [], "10": [], "11": [], "12": []
    };
    fs.writeFileSync(filePath, JSON.stringify(empty, null, 2));
    return empty;
  }

  const loaded = loadJsonSafe("archive.json", {
    "1": [], "2": [], "3": [], "4": [],
    "5": [], "6": [], "7": [], "8": [],
    "9": [], "10": [], "11": [], "12": []
  });

  return loaded;
}

let archive = initArchive();

function saveArchive() {
  fs.writeFileSync(dataPath("archive.json"), JSON.stringify(archive, null, 2));
}

// ------------------------ DAY / MONTH HELPERS ------------
function getDayNumber(date = new Date()) {
  const start = new Date(START_DATE + "T00:00:00");
  const diffMs = date.getTime() - start.getTime();
  let d = Math.floor(diffMs / 86400000) + 1;

  if (d < 1) d = 1;
  if (d > 365) d = ((d - 1) % 365) + 1;

  return d;
}

const getMonthFromDay = (d) => Math.ceil(d / 30);

const getIdea = (d) => ideas.find((x) => x.day === d);
const getTasks = (d) => tasks.find((x) => x.day === d)?.tasks || [];
const getTelegraphUrl = (d) =>
  telegraphLinks.find((x) => x.day === d)?.url || null;

// ------------------------ ARCHIVE NORMALIZATSIYA --------
function normalizeArchive() {
  const today = new Date();
  const currentDay = getDayNumber(today);
  const validTelegraphDays = new Set(
    telegraphLinks
      .filter((t) => typeof t.day === "number" && t.url)
      .map((t) => t.day)
  );

  for (let m = 1; m <= 12; m++) {
    const key = String(m);
    const arr = archive[key] || [];
    archive[key] = arr.filter((d) => {
      return (
        typeof d === "number" &&
        d >= 1 &&
        d <= currentDay &&
        validTelegraphDays.has(d)
      );
    }).sort((a, b) => a - b);
  }

  saveArchive();
}

normalizeArchive();

// ------------------------ ARXIV HELPERS ------------------
function getActiveMonths() {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    if (archive[String(m)]?.length > 0) months.push(m);
  }
  return months;
}

function buildMonthKeyboard() {
  const months = getActiveMonths();
  const rows = [];
  let row = [];

  months.forEach((m) => {
    row.push({
      text: `${m}-oy`,
      callback_data: `month_${m}`
    });

    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  });

  if (row.length) rows.push(row);

  rows.push([
    { text: "⬅️ Arxivdan chiqish", callback_data: "close_archive" }
  ]);

  return rows;
}

function buildDaysKeyboardForMonth(month) {
  const key = String(month);
  const days = (archive[key] || []).slice().sort((a, b) => a - b);
  const rows = [];
  let row = [];

  days.forEach((d) => {
    const url = getTelegraphUrl(d);
    if (!url) return;

    row.push({ text: `Kun ${d}`, url });

    if (row.length === 4) {
      rows.push(row);
      row = [];
    }
  });

  if (row.length) rows.push(row);

  rows.push([
    { text: "⬅️ Oylarga qaytish", callback_data: "back_to_months" }
  ]);

  return rows;
}

// ------------------------ DAILY POST ---------------------
async function sendDailyPost(chatId, date = new Date()) {
  const day = getDayNumber(date);
  const idea = getIdea(day);

  if (!idea) return;

  const url = getTelegraphUrl(day);

  const txt =
    `📘 Kun ${day}/365\n` +
    `“${idea.title}”\n\n` +
    `${idea.short}\n\n` +
    `──────────\n` +
    `👇 Batafsil o‘qish va oldingi kunlarni ko‘rish:`; 

  const inline_keyboard = [];

  if (url) {
    inline_keyboard.push([{ text: "🔍 Batafsil", url }]);
  } else {
    inline_keyboard.push([
      { text: "🔍 Batafsil link topilmadi", callback_data: "no_link" }
    ]);
  }

  inline_keyboard.push([
    { text: "📚 Arxiv", callback_data: "open_archive" }
  ]);

  await bot.sendMessage(chatId, txt, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard }
  });

  const t = getTasks(day);
  if (t.length > 0) {
    const taskTxt =
      `🧠 Bugungi mini vazifa\n` +
      `──────────\n\n` +
      t.map((v, i) => `${i + 1}) ${v}`).join("\n") +
      `\n\n#MiniVazifa #Kun${day}`;

    await bot.sendMessage(chatId, taskTxt, { parse_mode: "Markdown" });
  }

  const month = getMonthFromDay(day);
  const key = String(month);
  if (!archive[key]) archive[key] = [];

  if (!archive[key].includes(day)) {
    archive[key].push(day);
    archive[key].sort((a, b) => a - b);
    saveArchive();
  }
}

// ------------------------ CALLBACKLAR ------------------

// ❗ ENG MUHIM TUZATISH — bu yerda chatId = q.from.id bo‘ladi
bot.on("callback_query", async (q) => {
  const data = q.data;
  const userId = q.from.id;   // <<< faqat shaxsiyga yuboriladi

  // no_link
  if (data === "no_link") {
    return bot.answerCallbackQuery(q.id, {
      text: "Bu kun uchun Telegraph linki topilmadi.",
      show_alert: true
    });
  }

  // OCHISH
  if (data === "open_archive") {
    const monthKeyboard = buildMonthKeyboard();

    await bot.sendMessage(
      userId,
      "📚 Arxiv — qaysi oy bo‘yicha o‘qishni xohlaysiz?",
      {
        reply_markup: { inline_keyboard: monthKeyboard }
      }
    );

    return bot.answerCallbackQuery(q.id);
  }

  // OY TANLANDI
  if (data.startsWith("month_")) {
    const month = Number(data.split("_")[1]);
    const daysKeyboard = buildDaysKeyboardForMonth(month);

    await bot.sendMessage(
      userId,
      `📚 ${month}-oy — o‘qimoqchi bo‘lgan kuningizni tanlang:`,
      {
        reply_markup: { inline_keyboard: daysKeyboard }
      }
    );

    return bot.answerCallbackQuery(q.id);
  }

  // ORQAGA
  if (data === "back_to_months") {
    const monthKeyboard = buildMonthKeyboard();

    await bot.sendMessage(
      userId,
      "📚 Arxiv — qaysi oy bo‘yicha o‘qishni xohlaysiz?",
      {
        reply_markup: { inline_keyboard: monthKeyboard }
      }
    );

    return bot.answerCallbackQuery(q.id);
  }

  if (data === "close_archive") {
    return bot.answerCallbackQuery(q.id);
  }
});

// ------------------------ SCHEDULE -----------------------
schedule.scheduleJob("0 0 0 * * *", () => {
  sendDailyPost(CHANNEL_ID, new Date());
});

// ------------------------ TEST KOMANDALAR ----------------
bot.onText(/\/test_today/, (msg) => {
  sendDailyPost(msg.chat.id, new Date());
});

bot.onText(/\/test_archive/, (msg) => {
  const monthKeyboard = buildMonthKeyboard();
  bot.sendMessage(msg.chat.id, "📚 Arxiv (test) — qaysi oy?", {
    reply_markup: { inline_keyboard: monthKeyboard }
  });
});

bot.onText(/\/test_day_(\d+)/, (msg, match) => {
  const url = getTelegraphUrl(Number(match[1]));
  bot.sendMessage(msg.chat.id, `📘 Kun ${match[1]}\n👉 ${url || "link yo‘q"}`);
});
