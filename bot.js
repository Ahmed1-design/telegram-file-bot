const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const token = '8774629185:AAHJ7SFFVjA3GI7xyaUgjzg-4kSH0NOu4NI';
const bot = new TelegramBot(token, { polling: true });

const userState = {};
const lastMsg = {};

const dir = path.join(__dirname, 'files');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

// حذف رسالة البوت السابقة
function send(chatId, text, options = {}) {
    if (lastMsg[chatId]) {
        bot.deleteMessage(chatId, lastMsg[chatId]).catch(() => {});
    }

    return bot.sendMessage(chatId, text, options).then(msg => {
        lastMsg[chatId] = msg.message_id;
    });
}

// القائمة الرئيسية
function mainMenu(chatId, name) {
    userState[chatId] = "main";

    send(chatId,
        `👋 مرحباً ${name}\nاختر الخدمة:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔄 تحويل", callback_data: "convert" }],
                    [{ text: "🔗 دمج PDF", callback_data: "merge" }],
                    [{ text: "✂️ تقسيم PDF", callback_data: "split" }]
                ]
            }
        }
    );
}

// start
bot.onText(/\/start/, (msg) => {
    mainMenu(msg.chat.id, msg.from.first_name);
});

// الأزرار
bot.on("callback_query", (q) => {
    const chatId = q.message.chat.id;

    if (q.data === "back") {
        return mainMenu(chatId, q.from.first_name);
    }

    if (q.data === "convert") {
        userState[chatId] = "convert";
        return send(chatId, "📎 أرسل أي ملف للتحويل", {
            reply_markup: {
                inline_keyboard: [[{ text: "⬅ رجوع", callback_data: "back" }]]
            }
        });
    }

    if (q.data === "merge") {
        userState[chatId] = "merge";
        return send(chatId, "🔗 أرسل PDF للدمج", {
            reply_markup: {
                inline_keyboard: [[{ text: "⬅ رجوع", callback_data: "back" }]]
            }
        });
    }

    if (q.data === "split") {
        userState[chatId] = "split";
        return send(chatId, "✂️ أرسل PDF للتقسيم", {
            reply_markup: {
                inline_keyboard: [[{ text: "⬅ رجوع", callback_data: "back" }]]
            }
        });
    }
});

// استقبال الملفات
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (!msg.document) return;

    const filePath = await bot.downloadFile(msg.document.file_id, dir);
    const state = userState[chatId];

    send(chatId, "⏳ جاري المعالجة...");

    try {

        // 🔄 تحويل (مبدئي: يرجع نفس الملف PDF لاحقاً)
        if (state === "convert") {
            await bot.sendDocument(chatId, filePath);
        }

        // 🔗 دمج PDF
        if (state === "merge") {
            const pdfDoc = await PDFDocument.create();
            const pdfBytes = fs.readFileSync(filePath);

            const src = await PDFDocument.load(pdfBytes);
            const pages = await pdfDoc.copyPages(src, src.getPageIndices());
            pages.forEach(p => pdfDoc.addPage(p));

            const out = await pdfDoc.save();
            const outputPath = filePath + "_merged.pdf";

            fs.writeFileSync(outputPath, out);
            await bot.sendDocument(chatId, outputPath);
        }

        // ✂️ تقسيم PDF (أول صفحة فقط)
        if (state === "split") {
            const pdfBytes = fs.readFileSync(filePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);

            const newPdf = await PDFDocument.create();

            if (pdfDoc.getPageCount() > 0) {
                const [page] = await newPdf.copyPages(pdfDoc, [0]);
                newPdf.addPage(page);
            }

            const out = await newPdf.save();
            const outputPath = filePath + "_split.pdf";

            fs.writeFileSync(outputPath, out);
            await bot.sendDocument(chatId, outputPath);
        }

        userState[chatId] = null;

    } catch (e) {
        send(chatId, "❌ حصل خطأ في المعالجة");
    }
});
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
