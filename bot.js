const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");
const axios = require("axios");
const Tesseract = require("tesseract.js");
const { PDFDocument } = require("pdf-lib");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot Running"));
app.listen(PORT);

// مستخدمين
let users = {};

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = {};

  bot.sendMessage(chatId, "👋 أهلاً\nاختار نوع الملف:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "PDF", callback_data: "in_pdf" }],
        [{ text: "PPT", callback_data: "in_ppt" }],
        [{ text: "صورة", callback_data: "in_img" }],
        [{ text: "ملف آخر", callback_data: "in_other" }]
      ]
    }
  });
});

// الأزرار
bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (!users[chatId]) return;

  if (data.startsWith("in_")) {
    users[chatId].inputType = data;

    bot.sendMessage(chatId, "📌 اختر نوع التحويل:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "PDF", callback_data: "out_pdf" }],
          [{ text: "OCR", callback_data: "out_ocr" }]
        ]
      }
    });
  }

  if (data.startsWith("out_")) {
    users[chatId].outputType = data;

    bot.sendMessage(chatId, "📎 أرسل الملف الآن");
  }
});

// تحميل ملف
async function download(fileId, path) {
  const link = await bot.getFileLink(fileId);
  const res = await axios({ url: link, responseType: "stream" });

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(path);
    res.data.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

// document
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  if (!users[chatId]) return;

  const filePath = `file_${chatId}`;

  await download(msg.document.file_id, filePath);

  users[chatId].file = filePath;

  processFile(chatId);
});

// photo
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  if (!users[chatId]) return;

  const filePath = `img_${chatId}.jpg`;

  await download(msg.photo[msg.photo.length - 1].file_id, filePath);

  users[chatId].file = filePath;

  processFile(chatId);
});

// المعالجة الحقيقية
async function processFile(chatId) {
  const file = users[chatId].file;
  const out = users[chatId].outputType;

  bot.sendMessage(chatId, "⏳ جاري التحويل...");

  try {
    // OCR
    if (out === "out_ocr") {
      const result = await Tesseract.recognize(file, "eng+ara");

      const textFile = `out_${chatId}.txt`;
      fs.writeFileSync(textFile, result.data.text);

      return bot.sendDocument(chatId, textFile);
    }

    // PDF تحويل بسيط (صورة → PDF)
    if (out === "out_pdf") {
      const pdfDoc = await PDFDocument.create();
      const imgBytes = fs.readFileSync(file);

// نحاول PNG أولاً لأنه أكثر أمان
let img;
try {
  img = await pdfDoc.embedPng(imgBytes);
} catch {
  img = await pdfDoc.embedJpg(imgBytes);
}
      const page = pdfDoc.addPage([600, 800]);

      page.drawImage(img, {
        x: 50,
        y: 100,
        width: 500,
        height: 600
      });

      const pdfBytes = await pdfDoc.save();

      const outFile = `out_${chatId}.pdf`;
      fs.writeFileSync(outFile, pdfBytes);

      return bot.sendDocument(chatId, outFile);
    }

    bot.sendMessage(chatId, "❌ هذا النوع غير مدعوم حالياً");
  } catch (e) {
    console.log(e);
    bot.sendMessage(chatId, "❌ فشل التحويل");
  }
}
