import { getCourseList, updateCustomerProfile, createOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCourseFlexMessage } from './message_templates.js';

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

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    tools: tools,
    systemInstruction: {
      // 加上強制指令，阻止 AI 閒聊，要求立即讀取清單
      parts: [{ text: "你是專業的課程預約客服。當使用者提到想上課、想看課程或要求列出時，請『必須』立刻呼叫 getCourseList function 來獲取清單，絕對不要用反問的方式。回覆請俐落。" }]
    }
  };

  try {
    let aiResponseText = '';
    let flexMessage = null;

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!geminiRes.ok) {
       console.error("Gemini API Error:", await geminiRes.text());
       return await replyToLINE(event.replyToken, "系統連線異常，請稍後再試。", null, env);
    }

    const data = await geminiRes.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.functionCall) {
        const fnName = part.functionCall.name;
        const args = part.functionCall.args;

        if (fnName === 'getCourseList') {
          const courses = await getCourseList(env);
          if (courses && courses.length > 0) {
            aiResponseText = "為您列出目前的課程：";
            flexMessage = generateCourseFlexMessage(courses);
          } else {
            aiResponseText = "目前沒有可報名的課程或系統整理中，請稍後再試。";
          }
        } else if (fnName === 'createOrder') {
          await createOrder(args.lineUid || userId, args.courseId, args.amount, env);
          aiResponseText = `已為您完成預約紀錄！課程ID：${args.courseId}。`;
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

    await replyToLINE(event.replyToken, aiResponseText, flexMessage, env);

  } catch (error) {
    console.error('Agent Logic Error:', error);
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
    body: JSON.stringify({
      replyToken: replyToken,
      messages: messages
    })
  });

  // 如果發送 Flex 失敗，將錯誤印出以利除錯
  if (!res.ok) {
    console.error("LINE API 發送失敗:", await res.text());
    console.error("發送的 Payload:", JSON.stringify(messages));
  }
}
