import { getCourseCategories, getCourseList, createOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage } from './message_templates.js';

// OpenAI 工具定義
const tools = [
  {
    type: "function",
    function: {
      name: "getCourseCategories",
      description: "查詢所有的課程分類、階段或類型清單。用於用戶尚未指定任何類型時。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getCourseList",
      description: "根據特定的分類名稱讀取課程詳細清單。當用戶指定了某個階段或類型時呼叫。",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "課程分類名稱" }
        },
        required: ["category"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "createOrder",
      description: "正式寫入預約報名紀錄到 Orders 表中",
      parameters: {
        type: "object",
        properties: {
          lineUid: { type: "string", description: "LINE UID" },
          courseId: { type: "string", description: "課程 ID" },
          amount: { type: "number", description: "金額" }
        },
        required: ["lineUid", "courseId", "amount"]
      }
    }
  }
];

// 指數退避重試函式
async function fetchWithRetry(url, options, maxRetries = 3) {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || (response.status !== 429 && response.status < 500)) {
        return response;
      }
    } catch (err) {}
    await new Promise(resolve => setTimeout(resolve, delay));
    delay *= 2;
  }
  return await fetch(url, options);
}

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text;
  const userId = event.source.userId;

  const requestBody = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `你是專業課程客服。請嚴格遵守以下對話邏輯：
1. 如果用戶的訊息包含明確的類別名稱（例如：工作坊、一般、蛻變階段、完整階段），請『優先』呼叫 getCourseList 並傳入該類別。
2. 如果用戶只是含糊地說想看課程、看清單，且『未提及』任何具體類別，請呼叫 getCourseCategories 顯示分類選單。
3. 如果用戶點擊報名按鈕（訊息含編號與金額），請直接呼叫 createOrder。
4. 預約後回覆：『已為您完成預約！後續將由專人與您聯繫。』
5. 嚴禁在已經知道類別的情況下又跳回第一步顯示選單。`
      },
      { role: "user", content: userMessage }
    ],
    tools: tools,
    tool_choice: "auto"
  };

  try {
    const gptRes = await fetchWithRetry(
      "https://api.openai.com/v1/chat/completions",
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!gptRes.ok) {
      const errorDetail = await gptRes.text();
      await sendTelegramMessage(`❌ GPT API 失敗: ${errorDetail}`, env);
      return;
    }

    const data = await gptRes.json();
    const message = data.choices[0].message;

    let aiResponseText = '';
    let flexMessage = null;

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

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
            aiResponseText = `目前「${args.category}」分類下沒有開放中的課程。`;
          }
        } else if (fnName === 'createOrder') {
          await createOrder(userId, args.courseId, args.amount, env);
          aiResponseText = "已為您完成預約！後續將由專人與您聯繫。";
          await sendTelegramMessage(`✅ 新預約報名！\n使用者：${userId}\n課程ID：${args.courseId}`, env);
        }
      }
    } else {
      aiResponseText = message.content;
    }

    if (aiResponseText || flexMessage) {
      await replyToLINE(event.replyToken, aiResponseText, flexMessage, env);
    }

  } catch (error) {
    await sendTelegramMessage(`❌ GPT 處理錯誤: ${error.message}`, env);
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
