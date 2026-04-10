import { getCourseCategories, getCourseList, updateCustomerProfile, createOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage } from './message_templates.js';

const tools = [
  {
    functionDeclarations: [
      {
        name: "getCourseCategories",
        description: "第一步：查詢所有的課程類型與階段 (例如:一般, 工作坊, 完整階段)",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "getCourseList",
        description: "第二步：根據使用者選擇的課程類型，讀取該分類下的課程清單",
        parameters: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING", description: "課程類型" }
          },
          required: ["category"]
        }
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
      parts: [{ text: "你是專業的課程預約客服。當使用者提到想上課或查詢課程時，必須先呼叫 getCourseCategories 列出課程類型。當使用者指定了類型後，再呼叫 getCourseList 取得該分類的課程。不要用反問的方式閒聊，直接呼叫功能即可。" }]
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
       return await replyToLINE(event.replyToken, "系統連線異常，請稍後再試。", null, env);
    }

    const data = await geminiRes.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.functionCall) {
        const fnName = part.functionCall.name;
        const args = part.functionCall.args;

        if (fnName === 'getCourseCategories') {
          const categories = await getCourseCategories(env);
          if (categories && categories.length > 0) {
            aiResponseText = "請選擇您想了解的課程類型：";
            flexMessage = generateCategoryFlexMessage(categories);
          } else {
            aiResponseText = "目前沒有設定課程類型，請稍後再試。";
          }
        } else if (fnName === 'getCourseList') {
          const courses = await getCourseList(args.category, env);
          if (courses && courses.length > 0) {
            aiResponseText = `為您列出「${args.category}」的課程：`;
            flexMessage = generateCourseFlexMessage(courses);
          } else {
            aiResponseText = `目前「${args.category}」分類下沒有課程喔。`;
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

  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ replyToken, messages })
  });
}
