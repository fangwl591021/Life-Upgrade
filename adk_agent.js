import { getCourseList, updateCustomerProfile, createOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCourseFlexMessage } from './message_templates.js';

// 定義 Tool Combination 工具清單
const tools = [
  {
    functionDeclarations: [
      {
        name: "getCourseList",
        description: "讀取現有課程列表與價格",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "createOrder",
        description: "在購買紀錄表中寫入新資料",
        parameters: {
          type: "OBJECT",
          properties: {
            lineUid: { type: "STRING", description: "客戶的 LINE UID" },
            courseId: { type: "STRING", description: "課程 ID" },
            amount: { type: "NUMBER", description: "購買金額" }
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

  // 組合給 Gemini 的請求內容
  const requestBody = {
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    tools: tools,
    systemInstruction: {
      parts: [{ text: "你是專業的課程預約客服機器人。請根據使用者需求查詢課程，並協助建立訂單。需要時請呼叫對應的 function。" }]
    }
  };

  try {
    let aiResponseText = '';
    let flexMessage = null;

    // 呼叫 Gemini API
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await geminiRes.json();
    const candidate = data.candidates[0];
    const parts = candidate.content.parts;

    // 解析 Gemini 的回覆，判斷是否呼叫 Function
    for (const part of parts) {
      if (part.functionCall) {
        const fnName = part.functionCall.name;
        const args = part.functionCall.args;

        if (fnName === 'getCourseList') {
          const courses = await getCourseList(env);
          aiResponseText = `我們目前有以下課程：\n${courses.map(c => `- ${c.name} ($${c.price})`).join('\n')}\n請問想預約哪一堂？`;
          flexMessage = generateCourseFlexMessage(courses);
        } else if (fnName === 'createOrder') {
          await createOrder(args.lineUid || userId, args.courseId, args.amount, env);
          aiResponseText = `已為您完成預約紀錄！課程ID：${args.courseId}。`;
          // 訂單成立同時發送 Telegram 通知
          await sendTelegramMessage(`新訂單建立！\n客戶：${userId}\n課程：${args.courseId}\n金額：${args.amount}`, env);
        }
      } else if (part.text) {
        aiResponseText += part.text;
      }
    }

    // 防錯機制
    if (!aiResponseText && !flexMessage) {
      aiResponseText = "處理您的請求時發生狀況，請稍後再試。";
    }

    // 回覆給 LINE 使用者
    await replyToLINE(event.replyToken, aiResponseText, flexMessage, env);

  } catch (error) {
    console.error('Gemini AI Error:', error);
    await replyToLINE(event.replyToken, "系統忙碌中，請稍後再試。", null, env);
  }
}

// 封裝 LINE 回覆 API
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
    body: JSON.stringify({
      replyToken: replyToken,
      messages: messages
    })
  });
}
