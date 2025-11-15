// index.js
// =========================================
//  Yangi Odat 🌱 — 365 Kunlik G'oyalar Bot
//  PREMIUM ARXIV (Oy → Kun) TIZIMI
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
const TIMEZONE = process.env.TIMEZONE || "Asia/Tashkent";

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
    console.warn(`⚠️ ${file} topilmadi → default.`);
    return def;
  }
}

// ------------------------ ARCHIVE INIT -------------------
function initArchive() {
  const f = dataPath("archive.json");

  if (!fs.existsSync(f)) {
    console.log("📦 archive.json yaratildi.");

    const empty = {
      "1": [], "2": [], "3": [], "4": [], "5": [],
      "6": [], "7": [], "8": [], "9": [], "10": [],
      "11": [], "12": []
    };

    fs.writeFileSync(f, JSON.stringify(empty, null, 2));
    return empty;
  }

  return loadJsonSafe("archive.json", {
    "1": [], "2": [], "3": [], "4": [], "5": [],
    "6": [], "7": [], "8": [], "9": [], "10": [],
    "11": [], "12": []
  });
}

let ideas = loadJsonSafe("ideas.json", []);
let tasks = loadJsonSafe("tasks.json", []);
let telegraphLinks = loadJsonSafe("telegraph_links.json", []);
let weeklyReports = loadJsonSafe("weekly_reports.json", []);
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

function getWeekNumber(date = new Date()) {
  const s = new Date(START_DATE + "T00:00:00");
  return Math.floor((date - s) / (1000 * 60 * 60 * 24 * 7)) + 1;
}

const getMonthFromDay = (d) => Math.ceil(d / 30);

const getIdea = (d) => ideas.find((x) => x.day === d);
const getTasks = (d) => tasks.find((x) => x.day === d)?.tasks || [];
const getTelegraphUrl = (d) =>
  telegraphLinks.find((x) => x.day === d)?.url || null;

const getReport = (w) => weeklyReports.find((x) => x.week === w);

// ------------------------ DAILY POST ---------------------
async function sendDailyPost(chatId, date = new Date()) {
  const day = getDayNumber(date);
  const idea = getIdea(day);

  if (!idea) return console.warn("⚠️", day, "-kunning g‘oyasi yo‘q");

  const url = getTelegraphUrl(day);

  const txt =
    `📘 Kun ${day}/365\n` +
    `“${idea.title}”\n\n` +
    `${idea.short}\n\n──────────\n👇 Batafsil o‘qish:`;

  const btn = [
    [{ text: "🔍 Batafsil", url }],
    [{ text: "📚 Arxiv", callback_data: "open_archive" }]
  ];

  await bot.sendMessage(chatId, txt, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: btn }
  });

  // MINI VAZIFA
  const t = getTasks(day);
  if (t.length > 0) {
    const taskTxt =
      `🧠 Bugungi mini vazifa:\n\n` +
      t.map((v, i) => `${i + 1}) ${v}`).join("\n") +
      `\n\n#MiniVazifa #Kun${day}`;

    await bot.sendMessage(chatId, taskTxt, { parse_mode: "Markdown" });
  }

  // ARXIVGA YOZILADI
  const month = getMonthFromDay(day);
  if (!archive[month].includes(day)) {
    archive[month].push(day);
    archive[month].sort((a, b) => a - b);
    saveArchive();
  }

  console.log("✅ Yuborildi va arxivga qo‘shildi:", day);
}

// ------------------------ WEEKLY POST --------------------
async function sendWeeklySummary(chatId, date = new Date()) {
  const week = getWeekNumber(date);
  const r = getReport(week);
  if (!r) return;

  await bot.sendMessage(chatId, r.text, { parse_mode: "Markdown" });
}

// ------------------------ ARXIV MENYU ---------------------
function monthName(i) {
  return `${i}-oy`;
}

bot.on("callback_query", async (q) => {
  const data = q.data;
  const chatId = q.message.chat.id;

  // 📚 ASOSIY ARXIV
  if (data === "open_archive") {
    const rows = [];
    for (let i = 1; i <= 12; i += 2) {
      rows.push([
        { text: monthName(i), callback_data: `month_${i}` },
        { text: monthName(i + 1), callback_data: `month_${i + 1}` }
      ]);
    }

    return bot.editMessageText("📚 Arxiv — oy tanlang:", {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: rows }
    });
  }

  // OY TANLANGANDA
  if (data.startsWith("month_")) {
    const m = Number(data.split("_")[1]);
    const days = archive[m];

    if (!days || days.length === 0) {
      return bot.answerCallbackQuery(q.id, {
        text: "Bu oyda hali hech narsa yo‘q",
        show_alert: true
      });
    }

    const rows = [];
    let row = [];

    days.forEach((d) => {
      row.push({ text: `Kun ${d}`, callback_data: `day_${d}` });
      if (row.length === 3) {
        rows.push(row);
        row = [];
      }
    });

    if (row.length) rows.push(row);

    rows.push([{ text: "⬅️ Orqaga", callback_data: "open_archive" }]);

    return bot.editMessageText(`${m}-oy — kun tanlang:`, {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: rows }
    });
  }

  // KUN TANLANGANDA
  if (data.startsWith("day_")) {
    const d = Number(data.split("_")[1]);
    const url = getTelegraphUrl(d);

    if (!url) {
      return bot.answerCallbackQuery(q.id, {
        text: "Bu kunga link yo‘q",
        show_alert: true
      });
    }

    await bot.sendMessage(chatId, `📘 Kun ${d}\n👉 ${url}`);
    return bot.answerCallbackQuery(q.id);
  }
});

// ------------------------ SCHEDULE -----------------------
schedule.scheduleJob("0 35 0 * * *", () => {
  sendDailyPost(CHANNEL_ID);
});

schedule.scheduleJob("0 0 21 * * 0", () => {
  sendWeeklySummary(CHANNEL_ID);
});

// ------------------------ TEST KOMANDALAR -----------------
bot.onText(/\/test_today/, (msg) => sendDailyPost(msg.chat.id));
bot.onText(/\/test_week/, (msg) => sendWeeklySummary(msg.chat.id));
bot.onText(/\/test_archive/, (msg) => {
  bot.sendMessage(msg.chat.id, "📚 Arxiv menyusi:", {
    reply_markup: { inline_keyboard: [[{ text: "📂 Ochiw", callback_data: "open_archive" }]] }
  });
});
bot.onText(/\/test_month/, (msg) => {
  bot.sendMessage(msg.chat.id, "1-oy kunlari:", {
    reply_markup: {
      inline_keyboard: archive["1"].map((d) => [{
        text: `Kun ${d}`,
        callback_data: `day_${d}`
      }])
    }
  });
});
bot.onText(/\/test_day_(\d+)/, (msg, match) => {
  const day = Number(match[1]);
  const url = getTelegraphUrl(day);
  bot.sendMessage(msg.chat.id, url ? url : "Bu kunda link yo‘q.");
});
