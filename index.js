// index.js
// =========================================
//  Yangi Odat 365 Kunlik G‘oyalar Bot
//  SUPABASE + REYTING + XAVFSIZLIK
//  Node >= 20, "type": "module"
// =========================================

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import TelegramBot from "node-telegram-bot-api";
import schedule from "node-schedule";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = (file) => path.join(__dirname, "data", file);

// ------------------------ ENV ---------------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const START_DATE = process.env.START_DATE;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!BOT_TOKEN || !CHANNEL_ID || !START_DATE || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env da kerakli o‘zgaruvchilar yetishmayapti!");
  process.exit(1);
}

// ------------------------ SUPABASE INIT ----------------
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("✅ Supabase ulandi");

// ------------------------ BOT INIT -----------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("✅ Bot ishga tushdi...");

// ------------------------ JSON LOAD (migratsiya uchun) ------
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

// ------------------------ SUPABASE HELPERS ----------------
async function getOrCreateUser(userId, first_name, last_name, username) {
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        telegram_id: userId,
        first_name,
        last_name: last_name || null,
        username: username || null,
      },
      { onConflict: "telegram_id" }
    )
    .select()
    .single();

  if (error && error.code !== "23505") console.error("User error:", error);
  return data;
}

async function markRead(userId, day) {
  const { error } = await supabase.from("reads").upsert(
    { user_id: userId, day },
    { onConflict: "user_id,day" }
  );
  if (error) console.error("Read error:", error);
}

async function markTaskDone(userId, day, taskIndex) {
  const { error } = await supabase.from("task_done").upsert(
    { user_id: userId, day, task_index: taskIndex },
    { onConflict: "user_id,day,task_index" }
  );
  if (error) console.error("Task error:", error);
}

// ------------------------ DAILY POST (5:00) ----------------
async function sendDailyPost(chatId, date = new Date()) {
  const day = getDayNumber(date);
  const idea = getIdea(day);
  const url = getTelegraphUrl(day);

  const txt =
    `📚 Kun ${day}/365\n` +
    `“${idea?.title || ""}”\n\n` +
    `${idea?.short || ""}\n\n` +
    `👇 Batafsil o‘qish:\n`;

  const inline_keyboard = [];

  if (url) {
    inline_keyboard.push([{ text: "Batafsil 🔎", url }]);
  }

  const readCount = await supabase
    .from("reads")
    .select("user_id", { count: "exact" })
    .eq("day", day);
  const count = readCount.data?.length || 0;

  inline_keyboard.push([
    {
      text: `O‘qidim 👍(${count} ta)`,
      callback_data: `read_${day}`
    }
  ]);

  await bot.sendMessage(chatId, txt, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard }
  });

  // MINI VAZIFALAR
  const taskArr = getTasksList(day);
  if (taskArr.length) {
    const taskTxt =
      `⚔️ Bugungi Challenge\n\n` +
      taskArr.map((v, i) => `${i + 1}) ${v}`).join("\n") +
      `\n\n#Odat40kun #Kun${day}`;

    const taskKeyboard = [];
    for (let i = 0; i < taskArr.length; i++) {
      const done = await supabase
        .from("task_done")
        .select("user_id", { count: "exact" })
        .eq("day", day)
        .eq("task_index", i);
      const cnt = done.data?.length || 0;
      taskKeyboard.push([
        {
          text: `${i + 1}-ni bajardim 🤝(${cnt} ta)`,
          callback_data: `task_${day}_${i}`
        }
      ]);
    }

    await bot.sendMessage(chatId, taskTxt, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: taskKeyboard }
    });
  }
}

// ------------------------ KECHA NATIJALARI + REYTING (2:00) ----------------
async function sendYesterdayResults() {
  const yesterday = getDayNumber(new Date(Date.now() - 86400000));
  const today = getDayNumber();

  // Kechagi o'qiganlar soni
  const readRes = await supabase.from("reads").select("user_id").eq("day", yesterday);
  const readCount = readRes.data?.length || 0;

  // Kechagi vazifalarni bajarganlar
  const taskRes = await supabase.from("task_done").select("*").eq("day", yesterday);
  const taskStats = {};
  taskRes.data?.forEach(t => {
    if (!taskStats[t.task_index]) taskStats[t.task_index] = 0;
    taskStats[t.task_index]++;
  });

  const taskText = Object.keys(taskStats)
    .sort((a, b) => b - a)
    .map(idx => `${Number(idx) + 1}-vazifa: ${taskStats[idx]} kishi`)
    .join("\n") || "Hech kim bajarmadi";

  // === YANGI QISM: UMUMIY REYTING (reads + task_done) ===
  // 1) Barcha reads va task_done yozuvlarini olib kelamiz
  const [allReadsRes, allTasksRes] = await Promise.all([
    supabase.from("reads").select("user_id"),
    supabase.from("task_done").select("user_id")
  ]);

  const userScores = {};

  // 2) Har bir read -> +1 ball
  (allReadsRes.data || []).forEach(r => {
    const uid = String(r.user_id);
    userScores[uid] = (userScores[uid] || 0) + 1;
  });

  // 3) Har bir task_done yozuvi -> +1 ball
  (allTasksRes.data || []).forEach(t => {
    const uid = String(t.user_id);
    userScores[uid] = (userScores[uid] || 0) + 1;
  });

  // 4) Agar hech kim yo'q bo'lsa, rating bo'sh
  const userIds = Object.keys(userScores);
  let rating = [];
  if (userIds.length) {
    // Supabase dan user ma'lumotlarini olib kelamiz
    const { data: users } = await supabase
      .from("users")
      .select("telegram_id, first_name, last_name")
      .in("telegram_id", userIds.map(id => Number(id)));

    // 5) Users massiviga ballni biriktirib sort qilamiz
    rating = (users || [])
      .map(u => ({
        name: `${u.first_name} ${u.last_name || ""}`.trim() || String(u.telegram_id),
        score: userScores[String(u.telegram_id)] || 0
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  }

  // Medal/pozitsiya labeli (xuddi avvalgi kabi)
  const medal = (pos) => pos === 0 ? "1st" : pos === 1 ? "2nd" : pos === 2 ? "3rd" : `${pos + 1}-chi`;

  const ratingText = rating.length
    ? rating.map((u, i) => `${medal(i)} ${u.name} — ${u.score} ball`).join("\n")
    : "Hali hech kim yo‘q";

  const resultText = `
🌱 Kechagi natijalar: #Kun${yesterday}

📚 O‘qidi: ${readCount} kishi
🎉 Bajarilgan vazifalar:
${taskText}

👋 Top 40 Liderlar (ballar: O‘qilgan kunlar + bajarilgan vazifalar):
${ratingText}

Siz ham bugun kuchli bo‘ling!
Yiqilsangiz qayta turing shunda yutgan boʻlasiz.
`;

  await bot.sendMessage(CHANNEL_ID, resultText, { parse_mode: "Markdown" });
}
    

// ------------------------ CALLBACK QUERY ------------------
bot.on("callback_query", async (q) => {
  const data = q.data;
  const userId = String(q.from.id);
  const user = q.from;

  await getOrCreateUser(userId, user.first_name, user.last_name, user.username);

  // ---------------- O‘QIDIM ----------------
  if (data.startsWith("read_")) {
    const day = Number(data.split("_")[1]);

    const { data: already } = await supabase
      .from("reads")
      .select("user_id")
      .eq("user_id", userId)
      .eq("day", day);

    if (already?.length) {
      return bot.answerCallbackQuery(q.id, {
        text: "Siz allaqachon o‘qigansiz",
        show_alert: true
      });
    }

    await markRead(userId, day);

    const { count } = await supabase
      .from("reads")
      .select("*", { count: "exact", head: true })
      .eq("day", day);
    const newCount = count || 0;

    try {
      await bot.editMessageReplyMarkup(
        {
          inline_keyboard: [
            getTelegraphUrl(day) ? [{ text: "Batafsil 🔎", url: getTelegraphUrl(day) }] : [],
            [{ text: `O‘qidim 👍(${newCount} ta)`, callback_data: `read_${day}` }]
          ].filter(arr => arr.length)
        },
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id
        }
      );
    } catch (e) {}

    return bot.answerCallbackQuery(q.id, { text: "Rahmat! Siz zo‘rsiz!" });
  }

  // ---------------- VAZIFA ----------------
  if (data.startsWith("task_")) {
    const parts = data.split("_");
    const day = Number(parts[1]);
    const index = Number(parts[2]);

    const { data: already } = await supabase
      .from("task_done")
      .select("user_id")
      .eq("user_id", userId)
      .eq("day", day)
      .eq("task_index", index);

    if (already?.length) {
      return bot.answerCallbackQuery(q.id, {
        text: "Bu vazifani allaqachon bajargansiz",
        show_alert: true
      });
    }

    await markTaskDone(userId, day, index);

    const taskArr = getTasksList(day);
    const newKeyboard = [];
    for (let i = 0; i < taskArr.length; i++) {
      const { count } = await supabase
        .from("task_done")
        .select("*", { count: "exact", head: true })
        .eq("day", day)
        .eq("task_index", i);
      newKeyboard.push([
        {
          text: `${i + 1}-ni bajardim 🤝(${count || 0} ta)`,
          callback_data: `task_${day}_${i}`
        }
      ]);
    }

    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: newKeyboard },
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id
        }
      );
    } catch (e) {}

    return bot.answerCallbackQuery(q.id, { text: "Ajoyib! Siz oldinga ketyapsiz!" });
  }
});

// ------------------------ SCHEDULES -----------------------
// Har kuni 2:00 → Kechagi natijalar + Reyting
schedule.scheduleJob("0 0 21 * * *", () => {
  console.log("Natijalar yuborilmoqda...");
  sendYesterdayResults();
});

// Har kuni 5:00 → Yangi kunlik post
schedule.scheduleJob("0 0 3 * * *", () => {
  const now = new Date();
  console.log("Kunlik post:", now.toISOString());
  sendDailyPost(CHANNEL_ID, now);
});

// ------------------------ TEST KOMANDALAR ----------------
bot.onText(/\/test_today/, (msg) => {
  sendDailyPost(msg.chat.id, new Date());
});

bot.onText(/\/test_yesterday/, (msg) => {
  sendYesterdayResults();
});
