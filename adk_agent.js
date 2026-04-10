import { getCourseCategories, getCourseList, createOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage } from './message_templates.js';

const tools = [
  {
    functionDeclarations: [
      {
        name: "getCourseCategories",
        description: "查詢所有的課程分類、階段或類型清單",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "getCourseList",
        description: "根據特定的分類名稱讀取課程詳細清單",
        parameters: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING", description: "課程分類名稱" }
          },
          required: ["category"]
        }
      },
      {
        name: "createOrder",
        description: "在 Orders 表中寫入預約報名紀錄",
        parameters: {
          type: "OBJECT",
          properties: {
            lineUid: { type: "STRING", description: "LINE UID" },
            courseId: { type: "STRING", description: "課程 ID" },
            amount: { type: "NUMBER", description: "金額" }
          },
          required: ["lineUid", "courseId", "amount"]
        }
      }
    ]
  }
];

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text;
  const userId = event.source.userId;

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    tools: tools,
    systemInstruction: {
      parts: [{ text: "你是課程客服。當用戶想看課程，先呼叫 getCourseCategories 列出階段分類。用戶選定階段後，再呼叫 getCourseList 顯示該類的課程卡片。禁止反問，直接執行 Tool。" }]
    }
  };

  try {
    let aiResponseText = '';
    let flexMessage = null;

    // 呼叫 Gemini
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!geminiRes.ok) {
      const errorDetail = await geminiRes.text();
      await sendTelegramMessage(`❌ Gemini API 失敗: ${errorDetail}`, env);
      return await replyToLINE(event.replyToken, "系統 AI 連線失敗，請檢查 API Key。", null, env);
    }

    const data = await geminiRes.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.functionCall) {
        const fnName = part.functionCall.name;
        const args = part.functionCall.args;

        if (fnName === 'getCourseCategories') {
          const categories = await getCourseCategories(env);
          if (categories.length > 0) {
            aiResponseText = "請選擇您感興趣的課程類型：";
            flexMessage = generateCategoryFlexMessage(categories);
          } else {
            aiResponseText = "暫時查不到課程分類，請確認試算表設定。";
            await sendTelegramMessage("⚠️ 課程分類讀取結果為空，請檢查 Google Sheets 或 GAS。", env);
          }
        } else if (fnName === 'getCourseList') {
          const courses = await getCourseList(args.category, env);
          if (courses.length > 0) {
            aiResponseText = `以下是「${args.category}」的課程細項：`;
            flexMessage = generateCourseFlexMessage(courses);
          } else {
            aiResponseText = `目前「${args.category}」分類下沒有開放中的課程。`;
          }
        } else if (fnName === 'createOrder') {
          await createOrder(userId, args.courseId, args.amount, env);
          aiResponseText = "已為您完成預約！";
          await sendTelegramMessage(`✅ 新預約：${userId}\n課程：${args.courseId}`, env);
        }
      } else if (part.text) {
        aiResponseText += part.text;
      }
    }

    await replyToLINE(event.replyToken, aiResponseText, flexMessage, env);

  } catch (error) {
    await sendTelegramMessage(`❌ 執行緒錯誤: ${error.message}`, env);
    await replyToLINE(event.replyToken, "抱歉，處理過程中發生技術錯誤。", null, env);
  }
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: 'text', text: text });
  if (flexMessage) messages.push(flexMessage);

  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ replyToken, messages })
  });
  
  if (!res.ok) {
    const err = await res.text();
    await sendTelegramMessage(`❌ LINE 回覆失敗: ${err}`, env);
  }
}
