// index.js
// =========================================
//  Yangi Odat 🌱 — 365 Kunlik G'oyalar Bot
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
const CHANNEL_ID = process.env.CHANNEL_ID; // @channel yoki -100...
const START_DATE = process.env.START_DATE; // "2025-01-01"
const ARCHIVE_URL = process.env.ARCHIVE_URL || "";
const TIMEZONE = process.env.TIMEZONE || "Asia/Tashkent";

if (!BOT_TOKEN || !CHANNEL_ID || !START_DATE) {
  console.error("❌ .env da BOT_TOKEN, CHANNEL_ID yoki START_DATE yo'q.");
  process.exit(1);
}

// ------------------------ BOT INIT -----------------------
const bot = new TelegramBot(BOT_TOKEN, {
  polling: true,
});

console.log("✅ Bot ishga tushdi...");

// ------------------------ DATA LOADERS -------------------
function loadJsonSafe(filename, defaultValue) {
  try {
    const raw = fs.readFileSync(dataPath(filename), "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`⚠️ ${filename} o'qilmadi, default qiymat ishlatiladi.`);
    return defaultValue;
  }
}

let ideas = loadJsonSafe("ideas.json", []);
let tasks = loadJsonSafe("tasks.json", []);
let telegraphLinks = loadJsonSafe("telegraph_links.json", []);
let weeklyReports = loadJsonSafe("weekly_reports.json", []);

// ------------------------ HELPERS ------------------------
function getDayNumberFromStart(date = new Date()) {
  const start = new Date(START_DATE + "T00:00:00");
  const diffMs = date.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let day = diffDays + 1; // 1-kun = START_DATE

  // 1..365 oralig'ida aylantiramiz
  if (day < 1) day = 1;
  if (day > 365) {
    day = ((day - 1) % 365) + 1;
  }
  return day;
}

function getWeekNumberFromStart(date = new Date()) {
  const start = new Date(START_DATE + "T00:00:00");
  const diffMs = date.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return week < 1 ? 1 : week;
}

function getIdea(day) {
  return ideas.find((i) => i.day === day);
}

function getTasks(day) {
  const t = tasks.find((t) => t.day === day);
  return t ? t.tasks || [] : [];
}

function getTelegraphUrl(day) {
  const t = telegraphLinks.find((t) => t.day === day);
  return t ? t.url : null;
}

function getWeeklyReport(week) {
  return weeklyReports.find((w) => w.week === week);
}

// ------------------------ MAIN SENDER --------------------
async function sendDailyPost(targetChatId, forDate = new Date()) {
  const day = getDayNumberFromStart(forDate);
  const idea = getIdea(day);

  if (!idea) {
    console.warn(`⚠️ ${day}-kun uchun idea topilmadi (ideas.json).`);
    return;
  }

  const telegraphUrl = getTelegraphUrl(day);
  const dayText = `Kun ${day}/365`;
  const title = idea.title || "G‘oya";
  const short = idea.short || "";

  const mainText =
    `📘 ${dayText}\n` +
    `“${title}”\n\n` +
    `${short}\n\n` +
    `──────────\n\n` +
    `👇 Batafsil o‘qish:`;

  const inlineKeyboard = [];

  if (telegraphUrl) {
    inlineKeyboard.push({
      text: "🔍 Batafsil",
      url: telegraphUrl,
    });
  }

  if (ARCHIVE_URL) {
    inlineKeyboard.push({
      text: "📚 Arxiv",
      url: ARCHIVE_URL,
    });
  }

  try {
    // 1) Asosiy post
    await bot.sendMessage(targetChatId, mainText, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [inlineKeyboard],
      },
    });

    // 2) Mini vazifa — kanalning o'zida alohida xabar
    const dayTasks = getTasks(day);

    if (dayTasks.length > 0) {
      const tasksTextLines = dayTasks.map(
        (t, idx) => `${idx + 1}) ${t}`
      );

      const miniTaskText =
        `🧠 Bugungi mini vazifa:\n\n` +
        tasksTextLines.join("\n") +
        `\n\n💬 Bajarganingizni izohlarda yozib qoldiring.\n\n` +
        `#MiniVazifa #Kun${day}`;

      await bot.sendMessage(targetChatId, miniTaskText, {
        parse_mode: "Markdown",
      });
    } else {
      console.warn(`⚠️ ${day}-kun uchun tasks.json da mini vazifa yo'q.`);
    }

    console.log(`✅ ${day}-kunlik post yuborildi.`);
  } catch (err) {
    console.error("❌ Kunlik post yuborishda xato:", err.message);
  }
}

async function sendWeeklySummary(targetChatId, forDate = new Date()) {
  const week = getWeekNumberFromStart(forDate);
  const report = getWeeklyReport(week);

  if (!report) {
    console.warn(`⚠️ ${week}-hafta uchun weekly_reports.json da matn yo'q.`);
    return;
  }

  try {
    await bot.sendMessage(targetChatId, report.text, {
      parse_mode: "Markdown",
    });
    console.log(`✅ ${week}-haftalik hisobot yuborildi.`);
  } catch (err) {
    console.error("❌ Haftalik hisobot yuborishda xato:", err.message);
  }
}

// ------------------------ SCHEDULELAR --------------------
// Eslatma: node-schedule serverning mahalliy vaqt zonasi bo'yicha ishlaydi.
// Railway/hostingda timezone'ni Asia/Tashkent qilib qo'yish yaxshiroq.

// Har kuni soat 05:00 da (server vaqti bo'yicha) kanalga post yuborish
schedule.scheduleJob("0 0 5 * * *", () => {
  const now = new Date();
  console.log("⏰ Kunlik post vaqti:", now.toISOString());
  sendDailyPost(CHANNEL_ID, now);
});

// Har yakshanba kuni soat 21:00 da haftalik hisobot
// Cron: "0 0 21 * * 0"  => 0-sekund, 0-minut, 21-soat, har kuni, har oy, yakshanba
schedule.scheduleJob("0 0 21 * * 0", () => {
  const now = new Date();
  console.log("⏰ Haftalik hisobot vaqti:", now.toISOString());
  sendWeeklySummary(CHANNEL_ID, now);
});

// ------------------------ TEST KOMANDALAR ----------------
// Faqat o'zing sinab ko'rish uchun
bot.onText(/\/test_today/, async (msg) => {
  const chatId = msg.chat.id;
  await sendDailyPost(chatId, new Date());
});

bot.onText(/\/test_week/, async (msg) => {
  const chatId = msg.chat.id;
  await sendWeeklySummary(chatId, new Date());
});
