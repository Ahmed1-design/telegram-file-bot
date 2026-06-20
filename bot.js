const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const { PDFDocument } = require("pdf-lib");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

// ===================== STORAGE =====================
let users = {};

// ===================== START BOT =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = {
    file: null
  };

  bot.sendMessage(chatId, "👋 أهلاً بك\n📎 أرسل صورة أو ملف للتحويل");
});

// ===================== RECEIVE FILE =====================
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const fileLink = await bot.getFileLink(fileId);

  const response = await axios.get(fileLink, { responseType: "arraybuffer" });

  users[chatId].file = Buffer.from(response.data).toString("base64");

  showMenu(chatId);
});

// ===================== MENU =====================
function showMenu(chatId) {
  bot.sendMessage(chatId, "📌 اختر العملية:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🖼 تحويل إلى PDF", callback_data: "pdf" }],
        [{ text: "📝 OCR نص من الصورة", callback_data: "ocr" }]
      ]
    }
  });
}

// ===================== CALLBACK =====================
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const action = q.data;

  const fileBase64 = users[chatId]?.file;

  if (!fileBase64) {
    return bot.sendMessage(chatId, "❌ أرسل ملف أولاً");
  }

  bot.sendMessage(chatId, "⏳ جاري المعالجة...");

  const buffer = Buffer.from(fileBase64, "base64");

  // ===================== OCR =====================
  if (action === "ocr") {
    try {
      const result = await Tesseract.recognize(buffer, "eng+ara");

      return bot.sendMessage(chatId, "📝 النص:\n\n" + result.data.text);
    } catch (e) {
      console.log(e);
      return bot.sendMessage(chatId, "❌ فشل OCR");
    }
  }

  // ===================== IMAGE → PDF =====================
  if (action === "pdf") {
    try {
      const pdfDoc = await PDFDocument.create();

      const pngBuffer = await sharp(buffer).png().toBuffer();

      const image = await pdfDoc.embedPng(pngBuffer);

      const page = pdfDoc.addPage([600, 800]);

      const dims = image.scale(1);

      page.drawImage(image, {
        x: 50,
        y: 100,
        width: 500,
        height: (500 * dims.height) / dims.width
      });

      const pdfBytes = await pdfDoc.save();

      const outFile = `out_${chatId}.pdf`;
      fs.writeFileSync(outFile, pdfBytes);

      return bot.sendDocument(chatId, outFile);

    } catch (e) {
      console.log(e);
      return bot.sendMessage(chatId, "❌ فشل التحويل إلى PDF");
    }
  }
});

// ===================== API (للمستقبل) =====================
app.post("/convert", async (req, res) => {
  const { type, fileBase64 } = req.body;

  if (!fileBase64) {
    return res.json({ status: "error" });
  }

  const buffer = Buffer.from(fileBase64, "base64");

  try {
    // OCR API
    if (type === "ocr") {
      const result = await Tesseract.recognize(buffer, "eng+ara");
      return res.json({ text: result.data.text });
    }

    // PDF API
    if (type === "pdf") {
      const pdfDoc = await PDFDocument.create();

      const pngBuffer = await sharp(buffer).png().toBuffer();

      const image = await pdfDoc.embedPng(pngBuffer);
      const page = pdfDoc.addPage([600, 800]);

      const dims = image.scale(1);

      page.drawImage(image, {
        x: 50,
        y: 100,
        width: 500,
        height: (500 * dims.height) / dims.width
      });

      const pdfBytes = await pdfDoc.save();

      return res.json({
        file: Buffer.from(pdfBytes).toString("base64")
      });
    }

    return res.json({ status: "invalid type" });

  } catch (e) {
    console.log(e);
    return res.json({ status: "error" });
  }
});

// ===================== START SERVER =====================
app.listen(PORT, () => {
  console.log("🚀 Bot + API running on port", PORT);
});
