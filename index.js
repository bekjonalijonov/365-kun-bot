// index.js
// =========================================
//  Yangi Odat 🌱 — 365 Kunlik G‘oyalar Bot
//  PREMIUM (O‘qidim 👍) tizimi
//  Node >= 20, "type": "module"
// =========================================

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import TelegramBot from "node-telegram-bot-api";
import schedule from "node-schedule";

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

// ------------------------ JSON LOAD ----------------------
function loadJsonSafe(file, def) {
  try {
    const raw = fs.readFileSync(dataPath(file), "utf-8");
    return JSON.parse(raw);
  } catch {
    return def;
  }
}

let ideas = loadJsonSafe("ideas.json", []);
let tasks = loadJsonSafe("tasks.json", []);
let telegraphLinks = loadJsonSafe("telegraph_links.json", []);

// 🔥 Necha odam o‘qiganini saqlash
let readCount = loadJsonSafe("read_count.json", {});
function saveReadCount() {
  fs.writeFileSync(dataPath("read_count.json"), JSON.stringify(readCount, null, 2));
}

// 🔥 Har bir mini vazifani bajarganlar
// FORMAT: { "25": { "0": ["123","456"], "1":["789"] } }
let taskDone = loadJsonSafe("task_done.json", {});
function saveTaskDone() {
  fs.writeFileSync(dataPath("task_done.json"), JSON.stringify(taskDone, null, 2));
}

// ------------------------ DAY CALC -----------------------
function getDayNumber(date = new Date()) {
  const start = new Date(START_DATE + "T00:00:00");
  const diffMs = date.getTime() - start.getTime();
  let d = Math.floor(diffMs / 86400000) + 1;
  if (d < 1) d = 1;
  if (d > 365) d = ((d - 1) % 365) + 1;
  return d;
}

const getIdea = (d) => ideas.find((x) => x.day === d);
const getTasksList = (d) => tasks.find((x) => x.day === d)?.tasks || [];
const getTelegraphUrl = (d) =>
  telegraphLinks.find((x) => x.day === d)?.url || null;

// ------------------------ DAILY POST ---------------------
async function sendDailyPost(chatId, date = new Date()) {
  const day = getDayNumber(date);
  const idea = getIdea(day);
  const url = getTelegraphUrl(day);

  if (!readCount[day]) {
    readCount[day] = { count: 0, users: [] };
    saveReadCount();
  }

  const count = readCount[day].count;

  const txt =
    `📘 Kun ${day}/365\n` +
    `“${idea?.title || ""}”\n\n` +
    `${idea?.short || ""}\n\n` +
    `👇 Batafsil o‘qish:\n`;

  const inline_keyboard = [];

  if (url) {
    inline_keyboard.push([{ text: "🔍 Batafsil", url }]);
  }

  // O‘qidim tugmasi
  inline_keyboard.push([
    {
      text: `O‘qidim 👍 (${count} ta)`,
      callback_data: `read_${day}`
    }
  ]);

  await bot.sendMessage(chatId, txt, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard }
  });

  // MINI VAZIFA
  const taskArr = getTasksList(day);
  if (taskArr.length) {
    if (!taskDone[day]) taskDone[day] = {};

    for (let i = 0; i < taskArr.length; i++) {
      if (!Array.isArray(taskDone[day][i])) taskDone[day][i] = [];
    }
    saveTaskDone();

    const taskTxt =
      `🧠 Bugungi Challenge\n\n` +
      taskArr.map((v, i) => `${i + 1}) ${v}`).join("\n") +
      `\n\n#40kun #Kun${day}`;

    // 🔥 Tugmalar: 1-ni bajardim, 2-ni bajardim, 3-ni bajardim
    const taskKeyboard = taskArr.map((_, index) => {
      const cnt = taskDone[day][index].length;
      return [
        {
          text: `${index + 1}-ni bajardim 🤝 (${cnt} ta)`,
          callback_data: `task_${day}_${index}`
        }
      ];
    });

    await bot.sendMessage(chatId, taskTxt, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: taskKeyboard }
    });
  }
}

// ------------------------ CALLBACK QUERY ------------------
bot.on("callback_query", async (q) => {
  const data = q.data;
  const userId = String(q.from.id);

  // ---------------- O‘QIDIM ----------------
  if (data.startsWith("read_")) {
    const day = Number(data.split("_")[1]);

    if (!readCount[day]) readCount[day] = { count: 0, users: [] };

    if (readCount[day].users.includes(userId)) {
      return bot.answerCallbackQuery(q.id, {
        text: "Siz allaqachon o‘qigansiz 👍",
        show_alert: true
      });
    }

    readCount[day].users.push(userId);
    readCount[day].count++;
    saveReadCount();

    const newCount = readCount[day].count;

    try {
      await bot.editMessageReplyMarkup(
        {
          inline_keyboard: [
            [{ text: "🔍 Batafsil", url: getTelegraphUrl(day) }],
            [{ text: `O‘qidim 👍 (${newCount} ta)`, callback_data: `read_${day}` }]
          ]
        },
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id
        }
      );
    } catch (e) {}

    return bot.answerCallbackQuery(q.id, { text: "Rahmat! 😊" });
  }

  // ---------------- MINI VAZIFA ----------------
  if (data.startsWith("task_")) {
    const parts = data.split("_");
    const day = Number(parts[1]);
    const index = Number(parts[2]);

    if (!taskDone[day]) taskDone[day] = {};
    if (!Array.isArray(taskDone[day][index])) taskDone[day][index] = [];

    if (taskDone[day][index].includes(userId)) {
      return bot.answerCallbackQuery(q.id, {
        text: "Bu vazifani allaqachon bajargansiz ✅",
        show_alert: true
      });
    }

    taskDone[day][index].push(userId);
    saveTaskDone();

    // Tugmani yangilash
    try {
      const taskArr = getTasksList(day);

      const newKeyboard = taskArr.map((_, i) => {
        const cnt = taskDone[day][i].length;
        return [
          {
            text: `${i + 1}-ni bajardim (${cnt} ta)`,
            callback_data: `task_${day}_${i}`
          }
        ];
      });

      await bot.editMessageReplyMarkup(
        { inline_keyboard: newKeyboard },
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id
        }
      );
    } catch (e) {}

    return bot.answerCallbackQuery(q.id, {
      text: "Zo‘r! Vazifa bajarildi! 🚀"
    });
  }
});

// ------------------------ SCHEDULE -----------------------
// Har kuni 00:00 da kanalga yuboriladi
schedule.scheduleJob("0 0 0 * * *", () => {
  const now = new Date();
  console.log("⏰ Kunlik post:", now.toISOString());
  sendDailyPost(CHANNEL_ID, now);
});

// ------------------------ TEST KOMANDALAR ----------------
bot.onText(/\/test_today/, (msg) => {
  sendDailyPost(msg.chat.id, new Date());
});

bot.onText(/\/test_day_(\d+)/, (msg, match) => {
  const day = Number(match[1]);
  const url = getTelegraphUrl(day);
  bot.sendMessage(msg.chat.id, `Kun ${day} linki: ${url || "topilmadi"}`);
});
