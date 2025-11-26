// index.js
// =========================================
//  Yangi Odat — 365 Kunlik G‘oyalar Bot
//  SUPABASE + Top-50 Reyting + Xavfsizlik
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
const {
  BOT_TOKEN,
  CHANNEL_ID,
  START_DATE,
  SUPABASE_URL,
  SUPABASE_KEY
} = process.env;

if (!BOT_TOKEN || !CHANNEL_ID || !START_DATE || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env faylida kerakli ma'lumotlar yetishmayapti!");
  process.exit(1);
}

// ------------------------ SUPABASE ------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("✅ Supabase ulandi");

// ------------------------ BOT ------------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("✅ Bot ishga tushdi...");

// ------------------------ JSON DATA ------------------------
function loadJsonSafe(file, def) {
  try {
    const raw = fs.readFileSync(dataPath(file), "utf-8");
    return JSON.parse(raw);
  } catch {
    return def;
  }
}

const ideas = loadJsonSafe("ideas.json", []);
const tasks = loadJsonSafe("tasks.json", []);
const telegraphLinks = loadJsonSafe("telegraph_links.json", []);

// ------------------------ KUN HISOBLASH ------------------------
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
const getTelegraphUrl = (d) => telegraphLinks.find((x) => x.day === d)?.url || null;

// ------------------------ SUPABASE HELPER ------------------------
async function getOrCreateUser(userId, first_name, last_name, username) {
  const { data, error } = await supabase
    .from("users")
    .upsert(
      { telegram_id: userId, first_name, last_name: last_name || null, username: username || null },
      { onConflict: "telegram_id" }
    )
    .select()
    .single();

  if (error && error.code !== "23505") console.error("User upsert error:", error);
  return data;
}

async function markRead(userId, day) {
  await supabase.from("reads").upsert({ user_id: userId, day }, { onConflict: "user_id,day" });
}

async function markTaskDone(userId, day, taskIndex) {
  await supabase.from("task_done").upsert(
    { user_id: userId, day, task_index: taskIndex },
    { onConflict: "user_id,day,task_index" }
  );
}

// ------------------------ KUNLIK POST (5:00) ------------------------
async function sendDailyPost(chatId, date = new Date()) {
  const day = getDayNumber(date);
  const idea = getIdea(day);
  const url = getTelegraphUrl(day);

  const txt = `📘 *Kun ${day}/365*\n\n“${idea?.title || "G‘oya topilmadi"}”\n\n${idea?.short || ""}\n\n👇 Batafsil o‘qish:`;

  const inline_keyboard = [];

  if (url) inline_keyboard.push([{ text: "🔍 Batafsil o‘qish", url }]);

  const { count: readCnt = 0 } = await supabase.from("reads").select("*", { count: "exact", head: true }).eq("day", day);
  inline_keyboard.push([{ text: `O‘qidim 👍 (${readCnt} ta)`, callback_data: `read_${day}` }]);

  await bot.sendMessage(chatId, txt, { parse_mode: "Markdown", reply_markup: { inline_keyboard } });

  // MINI VAZIFALAR
  const taskArr = getTasksList(day);
  if (taskArr.length > 0) {
    const taskTxt = `🧠 *Bugungi Challenge*\n\n${taskArr.map((t, i) => `${i + 1}) ${t}`).join("\n")}\n\n#Odat40kun #Kun${day}`;

    const taskKeyboard = [];
    for (let i = 0; i < taskArr.length; i++) {
      const { count = 0 } = await supabase
        .from("task_done")
        .select("*", { count: "exact", head: true })
        .eq("day", day)
        .eq("task_index", i);
      taskKeyboard.push([{ text: `${i + 1}-ni bajardim 🤝 (${count} ta)`, callback_data: `task_${day}_${i}` }]);
    }

    await bot.sendMessage(chatId, taskTxt, { parse_mode: "Markdown", reply_markup: { inline_keyboard: taskKeyboard } });
  }
}

// ------------------------ KECHAGI NATIJALAR + TOP-50 (2:00) ------------------------
async function sendYesterdayResults() {
  const yesterday = getDayNumber(new Date(Date.now() - 86400000));

  // Kechagi o‘qiganlar
  const { count: readCount = 0 } = await supabase.from("reads").select("*", { count: "exact", head: true }).eq("day", yesterday);

  // Kechagi vazifalar statistikasi
  const { data: taskData } = await supabase.from("task_done").select("task_index").eq("day", yesterday);
  const taskStats = {};
  taskData?.forEach(t => taskStats[t.task_index] = (taskStats[t.task_index] || 0) + 1);

  const taskLines = Object.keys(taskStats)
    .sort((a, b) => taskStats[b] - taskStats[a])
    .map(idx => `${Number(idx) + 1}-vazifa: ${taskStats[idx]} kishi`)
    .join("\n") || "Hech kim bajarmadi";

  // Umumiy reyting (barcha kunlar bo‘yicha)
  const { data: allReads } = await supabase.from("reads").select("user_id");
  const scores = {};
  allReads?.forEach(r => scores[r.user_id] = (scores[r.user_id] || 0) + 1);

  const userIds = Object.keys(scores);
  let top50 = [];

  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("telegram_id, first_name, last_name")
      .in("telegram_id", userIds);

    top50 = users
      .map(u => ({
        name: `${u.first_name} ${u.last_name || ""}`.trim(),
        score: scores[u.telegram_id]
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }

  const medal = (i) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}-chi`;

  const ratingText = top50.length
    ? top50.map((u, i) => `${medal(i)} ${u.name} — *${u.score} kun*`).join("\n")
    : "Hali hech kim yo‘q";

  const finalText = `
🌅 *Kechagi natijalar #Kun${yesterday}*

📖 O‘qidi: *${readCount}* kishi
✅ Bajarilgan vazifalar:
${taskLines}

🏆 *Top 50 Liderlar* (umumiy kunlar bo‘yicha):
${ratingText}

🔥 Bugun ham kuchli bo‘lamiz! Birga oldinga! 🚀
`.trim();

  await bot.sendMessage(CHANNEL_ID, finalText, { parse_mode: "Markdown" });
}

// ------------------------ CALLBACK ------------------------
bot.on("callback_query", async (q) => {
  const userId = String(q.from.id);
  const user = q.from;
  const data = q.data;

  await getOrCreateUser(userId, user.first_name, user.last_name, user.username);

  // O‘qidim
  if (data.startsWith("read_")) {
    const day = Number(data.split("_")[1]);

    const { data: alreadyRead } = await supabase.from("reads").select("user_id").eq("user_id", userId).eq("day", day);
    if (alreadyRead?.length > 0) {
      return bot.answerCallbackQuery(q.id, { text: "Siz allaqachon o‘qigansiz 👍", show_alert: true });
    }

    await markRead(userId, day);

    const { count = 0 } = await supabase.from("reads").select("*", { count: "exact", head: true }).eq("day", day);

    try {
      const kb = [[{ text: `O‘qidim 👍 (${count} ta)`, callback_data: `read_${day}` }]];
      if (getTelegraphUrl(day)) kb.unshift([{ text: "🔍 Batafsil o‘qish", url: getTelegraphUrl(day) }]);

      await bot.editMessageReplyMarkup({ inline_keyboard: kb }, {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id
      });
    } catch (e) {}

    return bot.answerCallbackQuery(q.id, { text: "Rahmat! Siz zo‘rsiz! 🔥" });
  }

  // Vazifa bajarildi
  if (data.startsWith("task_")) {
    const [_, dayStr, idxStr] = data.split("_");
    const day = Number(dayStr);
    const index = Number(idxStr);

    const { data: alreadyDone } = await supabase
      .from("task_done")
      .select("user_id")
      .eq("user_id", userId)
      .eq("day", day)
      .eq("task_index", index);

    if (alreadyDone?.length > 0) {
      return bot.answerCallbackQuery(q.id, { text: "Bu vazifani allaqachon bajargansiz ✅", show_alert: true });
    }

    await markTaskDone(userId, day, index);

    const taskArr = getTasksList(day);
    const newKb = [];
    for (let i = 0; i < taskArr.length; i++) {
      const { count = 0 } = await supabase
        .from("task_done")
        .select("*", { count: "exact", head: true })
        .eq("day", day)
        .eq("task_index", i);
      newKb.push([{ text: `${i + 1}-ni bajardim 🤝 (${count} ta)`, callback_data: `task_${day}_${i}` }]);
    }

    try {
      await bot.editMessageReplyMarkup({ inline_keyboard: newKb }, {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id
      });
    } catch (e) {}

    return bot.answerCallbackQuery(q.id, { text: "Ajoyib ish! Oldinga! 🚀" });
  }
});

// ------------------------ SCHEDULE ------------------------
schedule.scheduleJob("0 0 2 * * *", () => {
  console.log("⏰ 2:00 — Kechagi natijalar yuborilmoqda...");
  sendYesterdayResults();
});

schedule.scheduleJob("0 0 5 * * *", () => {
  const now = new Date();
  console.log("⏰ 5:00 — Yangi kunlik post yuborilmoqda...");
  sendDailyPost(CHANNEL_ID, now);
});

// ------------------------ TEST KOMANDALAR ------------------------
bot.onText(/\/test_today/, (msg) => sendDailyPost(msg.chat.id));
bot.onText(/\/test_yesterday/, () => sendYesterdayResults());

console.log("🚀 Bot to‘liq ishga tayyor!");
