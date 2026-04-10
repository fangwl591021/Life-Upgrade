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
        description: "正式寫入預約報名紀錄到 Orders 表中",
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

// 指數退避重試函式
async function fetchGeminiWithRetry(url, options, maxRetries = 5) {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      // 如果成功或是非 503/429 錯誤，直接回傳
      if (response.ok || (response.status !== 503 && response.status !== 429)) {
        return response;
      }
    } catch (err) {
      // 網路層級錯誤也進行重試
    }
    // 等待後重試: 1s, 2s, 4s, 8s, 16s
    await new Promise(resolve => setTimeout(resolve, delay));
    delay *= 2;
  }
  return await fetch(url, options); // 最後一次嘗試
}

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text;
  const userId = event.source.userId;

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    tools: tools,
    systemInstruction: {
      parts: [{ text: `你是課程客服。
1. 當用戶想看課程，呼叫 getCourseCategories。
2. 用戶選定分類，呼叫 getCourseList。
3. 若訊息含「我想預約 [名] (編號:[ID], 金額:[價])」，請立刻呼叫 createOrder，禁止閒聊。
4. 預約後回覆：『已為您完成預約！後續將由專人與您聯繫。』` }]
    }
  };

  try {
    let aiResponseText = '';
    let flexMessage = null;

    // 使用重試機制呼叫 Gemini API (更新模型為穩定預覽版)
    const geminiRes = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!geminiRes.ok) {
      const errorDetail = await geminiRes.text();
      await sendTelegramMessage(`❌ Gemini API 最終失敗: ${errorDetail}`, env);
      return await replyToLINE(event.replyToken, "系統服務繁忙，請稍後再試一次。", null, env);
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
            aiResponseText = "暫時查不到課程分類。";
          }
        } else if (fnName === 'getCourseList') {
          const courses = await getCourseList(args.category, env);
          if (courses.length > 0) {
            aiResponseText = `以下是「${args.category}」的課程細項：`;
            flexMessage = generateCourseFlexMessage(courses);
          } else {
            aiResponseText = `目前該分類下沒有開放中的課程。`;
          }
        } else if (fnName === 'createOrder') {
          await createOrder(userId, args.courseId, args.amount, env);
          aiResponseText = "已為您完成預約！後續將由專人與您聯繫。";
          await sendTelegramMessage(`✅ 新預約報名！\n使用者：${userId}\n課程ID：${args.courseId}`, env);
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

  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ replyToken, messages })
  });
}
