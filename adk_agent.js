import { getCourseCategories, getCourseList, createOrder, getUserOrders, cancelOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

const tools = [
  {
    type: "function",
    function: {
      name: "getCourseCategories",
      description: "查詢所有可用的課程分類、階段或類型清單。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getCourseList",
      description: "根據特定的分類名稱讀取課程詳細清單。",
      parameters: {
        type: "object",
        properties: { category: { type: "string" } },
        required: ["category"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getUserOrders",
      description: "查詢當前使用者的報名、訂單、紀錄或匯款資訊。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "createOrder",
      description: "正式寫入預約報名紀錄到 Orders 表中。",
      parameters: {
        type: "object",
        properties: { lineUid: { type: "string" }, courseId: { type: "string" }, amount: { type: "number" } },
        required: ["lineUid", "courseId", "amount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "cancelOrder",
      description: "取消報名單號。",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"]
      }
    }
  }
];

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 快速指令攔截 (Fast Path) - 繞過 AI 運算以達成秒回 ---
  
  // 1. 處理：查看課程首頁 (分類選單)
  if (userMessage === '我想看課程' || userMessage === '有哪些課程' || userMessage === '課程列表') {
    const categories = await getCourseCategories(env);
    if (categories && categories.length > 0) {
      return await replyToLINE(event.replyToken, "為您列出課程類型：", generateCategoryFlexMessage(categories), env);
    } else {
      return await replyToLINE(event.replyToken, "目前暫時沒有開放的課程分類。", null, env);
    }
  }

  // 2. 處理：點擊特定分類 (格式: 我想查詢 [分類] 的課程)
  const categoryMatch = userMessage.match(/^我想查詢\s*(.+)\s*的課程$/);
  if (categoryMatch) {
    const category = categoryMatch[1].trim();
    const courses = await getCourseList(category, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, `以下是「${category}」的課程細項：`, generateCourseFlexMessage(courses), env);
    } else {
      // 關鍵優化：若沒資料就報錯，不要讓它墜落到 AI 邏輯去鬼打牆
      return await replyToLINE(event.replyToken, `目前「${category}」分類下暫無開放課程。`, null, env);
    }
  }

  // 3. 處理：報名紀錄查詢
  if (userMessage === '我的報名' || userMessage === '報名紀錄' || userMessage === '查詢報名') {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您的報名紀錄與匯款資訊：", generateOrderListFlexMessage(orders), env);
    } else {
      return await replyToLINE(event.replyToken, "查無報名紀錄，快去看看有什麼好課吧！", null, env);
    }
  }

  // 4. 處理：一鍵預約報名 (格式: 我想預約 [名稱] (編號:[ID], 金額:[價]))
  const orderMatch = userMessage.match(/\(編號:(.+),\s*金額:(\d+)\)/);
  if (orderMatch) {
    const courseId = orderMatch[1].trim();
    const amount = parseInt(orderMatch[2]);
    await createOrder(userId, courseId, amount, env);
    await sendTelegramMessage(`✅ 新報名：${userId}\n課程ID：${courseId}`, env);
    return await replyToLINE(event.replyToken, "已為您完成預約！後續將由專人聯繫。", null, env);
  }

  // --- 若不符合上述固定格式，才呼叫 GPT-4o 處理 ---
  const requestBody = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `你是專業課程客服。
1. 嚴禁反問用戶分類。
2. 若用戶提到具體類別，呼叫 getCourseList。
3. 若用戶只是隨意詢問，呼叫 getCourseCategories。
4. 回覆需極簡、原生感。`
      },
      { role: "user", content: userMessage }
    ],
    tools: tools,
    tool_choice: "auto"
  };

  try {
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify(requestBody)
    });

    const data = await gptRes.json();
    const message = data.choices[0].message;

    let aiResponseText = '';
    let flexMessage = null;

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};

        if (fnName === 'getCourseCategories') {
          const categories = await getCourseCategories(env);
          flexMessage = generateCategoryFlexMessage(categories);
          aiResponseText = "為您列出課程類型：";
        } else if (fnName === 'getCourseList') {
          const courses = await getCourseList(args.category, env);
          flexMessage = generateCourseFlexMessage(courses);
          aiResponseText = `「${args.category}」的課程如下：`;
        } else if (fnName === 'getUserOrders') {
          const orders = await getUserOrders(userId, env);
          if (orders.length > 0) {
            flexMessage = generateOrderListFlexMessage(orders);
            aiResponseText = "您的報名紀錄：";
          } else {
            aiResponseText = "查無報名紀錄。";
          }
        }
      }
    } else {
      aiResponseText = message.content;
    }

    if (aiResponseText || flexMessage) {
      await replyToLINE(event.replyToken, aiResponseText, flexMessage, env);
    }
  } catch (error) {
    console.error('AI Request Error:', error);
  }
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: 'text', text: text });
  if (flexMessage) messages.push(flexMessage);
  
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages })
  });
}
