import { getCourseCategories, getCourseList, createOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage } from './message_templates.js';

// OpenAI 工具定義
const tools = [
  {
    type: "function",
    function: {
      name: "getCourseCategories",
      description: "查詢所有的課程分類、階段或類型清單",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getCourseList",
      description: "根據特定的分類名稱讀取課程詳細清單",
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
    model: "gpt-4o", // 使用最先進的 gpt-4o 模型
    messages: [
      {
        role: "system",
        content: `你是課程客服。
1. 當用戶想看課程，請立刻呼叫 getCourseCategories 顯示分類選項。
2. 當用戶選定分類，請立刻呼叫 getCourseList 顯示課程卡片。
3. 重要：若用戶訊息包含「我想預約 [課程名] (編號:[ID], 金額:[價])」，這是用戶點擊了報名按鈕。請『禁止閒聊』，直接呼叫 createOrder 並傳入正確的 ID 與金額。
4. 成功後回覆：『已為您完成預約！後續將由專人與您聯繫。』回覆風格需簡潔，模擬 LINE 原生客服感。`
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
            aiResponseText = `目前該分類下沒有開放中的課程。`;
          }
        } else if (fnName === 'createOrder') {
          await createOrder(userId, args.courseId, args.amount, env);
          aiResponseText = "已為您完成預約！後續將由專人與您聯繫。";
          await sendTelegramMessage(`✅ 新預約報名！\n使用者：${userId}\n課程：${args.courseId}\n金額：${args.amount}`, env);
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
