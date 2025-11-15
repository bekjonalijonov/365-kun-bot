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
let ideas = loadJsonSafe("ideas.json", []);                // { day, title, short }
let tasks = loadJsonSafe("tasks.json", []);                // { day, tasks: [] }
let telegraphLinks = loadJsonSafe("telegraph_links.json", []); // { day, url }

// ------------------------ ARCHIVE INIT -------------------
function initArchive() {
  const filePath = dataPath("archive.json");

  // Yangi bo'lsa, toza 12 oylik struktura
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

  // Eski faylni o‘qiymiz
  const loaded = loadJsonSafe("archive.json", {
    "1": [], "2": [], "3": [], "4": [],
    "5": [], "6": [], "7": [], "8": [],
    "9": [], "10": [], "11": [], "12": []
  });

  return loaded;
}

let archive = initArchive();

// Archivni diskka saqlash
function saveArchive() {
  fs.writeFileSync(dataPath("archive.json"), JSON.stringify(archive, null, 2));
}

// ------------------------ DAY / MONTH HELPERS ------------
// START_DATE dan beri nechanchi kunligini hisoblab beradi
function getDayNumber(date = new Date()) {
  const start = new Date(START_DATE + "T00:00:00");
  const diffMs = date.getTime() - start.getTime();
  let d = Math.floor(diffMs / 86400000) + 1; // 1 kun = 86400000 ms

  if (d < 1) d = 1;
  if (d > 365) d = ((d - 1) % 365) + 1;

  return d;
}

// Kun raqamidan oy raqamini topish (1-30 → 1-oy, 31-60 → 2-oy, ...)
const getMonthFromDay = (d) => Math.ceil(d / 30);

// JSON helperlar
const getIdea = (d) => ideas.find((x) => x.day === d);
const getTasks = (d) => tasks.find((x) => x.day === d)?.tasks || [];
const getTelegraphUrl = (d) =>
  telegraphLinks.find((x) => x.day === d)?.url || null;

// ------------------------ ARCHIVE NORMALIZATSIYA --------
// Eski archive.json ichida ortiqcha kunlar bo‘lsa (masalan 1-kunda 3 kun yozib qo‘yilgan bo‘lsa)
// – START_DATE va bugungi kunga qarab filtrlaymiz.
// – faqat Telegraph linki bor va bugungi kungacha bo‘lgan kunlar qoladi.
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
      // 1..365 oraliqda, bugungi kungacha, va telegraph linki bor bo‘lsin
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
// Hamma oylar bo‘yicha yuborilgan kunlar
function getAllSentDays() {
  const all = [];
  for (let m = 1; m <= 12; m++) {
    const key = String(m);
    if (Array.isArray(archive[key])) {
      all.push(...archive[key]);
    }
  }
  return [...new Set(all)].sort((a, b) => a - b);
}

// Qaysi oylar bor: kamida bitta kuni yuborilgan oylar
function getActiveMonths() {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = String(m);
    if (archive[key] && archive[key].length > 0) {
      months.push(m);
    }
  }
  return months.sort((a, b) => a - b);
}

// Oy tanlash menyusi (1-oy, 2-oy,...)
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

  return rows;
}

// Berilgan oy ichidagi kunlar (faqat yuborilganlar)
function buildDaysKeyboardForMonth(month) {
  const key = String(month);
  const days = (archive[key] || []).slice().sort((a, b) => a - b);
  const rows = [];
  let row = [];

  days.forEach((d) => {
    const url = getTelegraphUrl(d);
    if (!url) return; // link bo‘lmasa tugma chiqmasin

    row.push({
      text: `Kun ${d}`,
      url
    });

    if (row.length === 4) { // bir qatorga 4ta tugma
      rows.push(row);
      row = [];
    }
  });

  if (row.length) rows.push(row);

  // Pastga orqaga tugmasi
  rows.push([
    { text: "⬅️ Oylarga qaytish", callback_data: "back_to_months" }
  ]);

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
    `${idea.short}\n\n` +
    `──────────\n` +
    `👇 Batafsil o‘qish va oldingi kunlarni ko‘rish:`; 

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
      `🧠 Bugungi mini vazifa\n` +
      `──────────\n\n` +
      t.map((v, i) => `${i + 1}) ${v}`).join("\n") +
      `\n\n#MiniVazifa #Kun${day}`;

    await bot.sendMessage(chatId, taskTxt, { parse_mode: "Markdown" });
  } else {
    console.warn(`⚠️ ${day}-kun uchun tasks.json da mini vazifa topilmadi.`);
  }

  // ARXIVGA YOZILADI (faqat yuborilgan kunlar)
  const month = getMonthFromDay(day);
  const key = String(month);

  if (!Array.isArray(archive[key])) {
    archive[key] = [];
  }

  if (!archive[key].includes(day)) {
    archive[key].push(day);
    archive[key].sort((a, b) => a - b);
    saveArchive();
  }

  console.log("✅ Yuborildi va arxivga qo‘shildi:", day);
}

// ------------------------ CALLBACKLAR (ARXIV) ------------

bot.on("callback_query", async (q) => {
  const data = q.data;
  const chatId = q.message.chat.id;

  // Batafsil link yo‘q bo‘lsa
  if (data === "no_link") {
    return bot.answerCallbackQuery(q.id, {
      text: "Bu kun uchun Telegraph linki topilmadi.",
      show_alert: true
    });
  }

  // 📚 ARXIVNI OCHISH — oylar menyusi
  if (data === "open_archive") {
    const monthKeyboard = buildMonthKeyboard();

    if (!monthKeyboard.length) {
      return bot.answerCallbackQuery(q.id, {
        text: "Hali arxivda birorta kun yo‘q.",
        show_alert: true
      });
    }

    await bot.sendMessage(
      chatId,
      "📚 Arxiv — qaysi oy bo‘yicha o‘qishni xohlaysiz?",
      {
        reply_markup: {
          inline_keyboard: monthKeyboard
        }
      }
    );

    return bot.answerCallbackQuery(q.id);
  }

  // Oy tanlandi: month_X
  if (data.startsWith("month_")) {
    const month = Number(data.split("_")[1]);
    const daysKeyboard = buildDaysKeyboardForMonth(month);

    if (daysKeyboard.length === 1) {
      // faqat orqaga tugmasi bo‘lsa
      return bot.answerCallbackQuery(q.id, {
        text: "Bu oy bo‘yicha hali o‘qilgan kunlar yo‘q.",
        show_alert: true
      });
    }

    await bot.editMessageText(
      `📚 ${month}-oy — o‘qimoqchi bo‘lgan kuningizni tanlang:`,
      {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: {
          inline_keyboard: daysKeyboard
        }
      }
    );

    return bot.answerCallbackQuery(q.id);
  }

  // Oylarga qaytish
  if (data === "back_to_months") {
    const monthKeyboard = buildMonthKeyboard();

    await bot.editMessageText(
      "📚 Arxiv — qaysi oy bo‘yicha o‘qishni xohlaysiz?",
      {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: {
          inline_keyboard: monthKeyboard
        }
      }
    );

    return bot.answerCallbackQuery(q.id);
  }
});

// ------------------------ SCHEDULE -----------------------
// Har kuni soat 05:00 da kanalga post yuborish
// CRON FORMAT: "sekund minut soat * * *"
// Masalan:
//   "0 0 5 * * *"   →  har kuni 05:00
//   "0 16 19 * * *" →  har kuni 19:16 (test uchun)
// Agar vaqtni test uchun o‘zgartirmoqchi bo‘lsang,
// faqat shu qatorni almashtirasan.

schedule.scheduleJob("0 40 21 * * *", () => {
  const now = new Date();
  console.log("⏰ Kunlik post vaqti:", now.toISOString());
  sendDailyPost(CHANNEL_ID, now);
});

// ------------------------ TEST KOMANDALAR ----------------
// Bugungi kunga mos postni hozir yuborish
bot.onText(/\/test_today/, (msg) => {
  const chatId = msg.chat.id;
  sendDailyPost(chatId, new Date());
});

// Arxiv oy menyusini test qilish
bot.onText(/\/test_archive/, (msg) => {
  const chatId = msg.chat.id;
  const monthKeyboard = buildMonthKeyboard();

  if (!monthKeyboard.length) {
    return bot.sendMessage(chatId, "📚 Arxiv hozircha bo‘sh.");
  }

  bot.sendMessage(
    chatId,
    "📚 Arxiv (test) — qaysi oy bo‘yicha o‘qishni xohlaysiz?",
    {
      reply_markup: {
        inline_keyboard: monthKeyboard
      }
    }
  );
});

// Muayyan kun uchun linkni tekshirish: /test_day_7
bot.onText(/\/test_day_(\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const day = Number(match[1]);
  const url = getTelegraphUrl(day);

  if (!url) {
    return bot.sendMessage(chatId, `Kun ${day} uchun Telegraph linki topilmadi.`);
  }

  bot.sendMessage(chatId, `📘 Kun ${day}\n👉 ${url}`);
});
