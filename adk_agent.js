import { getCourseCategories, getCourseList, createOrder, getUserOrders, cancelOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

const tools = [
  {
    type: "function",
    function: {
      name: "getCourseCategories",
      description: "顯示首頁的課程分類選單。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getCourseList",
      description: "顯示特定分類的課程清單。",
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
      description: "查詢當前用戶的所有報名紀錄。",
      parameters: { type: "object", properties: {} }
    }
  }
];

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 1. 超快速路徑 (Fast Path) - 秒讀秒回 ---
  
  // A. 我的報名
  if (userMessage.includes('我的報名') || userMessage.includes('報名紀錄')) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您的報名紀錄：", generateOrderListFlexMessage(orders), env);
    } else {
      return await replyToLINE(event.replyToken, "目前查無報名紀錄。", null, env);
    }
  }

  // B. 分類查詢 (修正正則表達式，確保精準攔截)
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const cat = categoryMatch[1].trim();
    await sendTelegramMessage(`🔍 偵測到分類查詢：[${cat}]`, env);
    
    try {
      const courses = await getCourseList(cat, env);
      await sendTelegramMessage(`📊 從試算表取得課程數：${courses ? courses.length : 0}`, env);
      
      if (courses && courses.length > 0) {
        const flex = generateCourseFlexMessage(courses);
        return await replyToLINE(event.replyToken, `以下是「${cat}」的課程細項：`, flex, env);
      } else {
        return await replyToLINE(event.replyToken, `抱歉，目前「${cat}」分類下暫無開放課程。`, null, env);
      }
    } catch (e) {
      await sendTelegramMessage(`❌ 讀取課程發生錯誤: ${e.message}`, env);
      return await replyToLINE(event.replyToken, "抱歉，讀取課程資料時發生問題。", null, env);
    }
  }

  // C. 課程首頁
  if (userMessage === '我想看課程' || userMessage === '有哪些課程') {
    const cats = await getCourseCategories(env);
    return await replyToLINE(event.replyToken, "請選擇感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
  }

  // --- 2. AI 路徑 (GPT-4o) ---
  const requestBody = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "你是課程客服。禁止反問，直接執行工具。用戶選定分類就顯示課程卡片。" },
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
    const message = data.choices?.[0]?.message;

    if (message?.tool_calls) {
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        if (fnName === 'getCourseCategories') {
          const cats = await getCourseCategories(env);
          await replyToLINE(event.replyToken, "為您列出課程類型：", generateCategoryFlexMessage(cats), env);
        } else if (fnName === 'getCourseList') {
          const courses = await getCourseList(args.category, env);
          await replyToLINE(event.replyToken, `「${args.category}」的課程如下：`, generateCourseFlexMessage(courses), env);
        } else if (fnName === 'getUserOrders') {
          const orders = await getUserOrders(userId, env);
          await replyToLINE(event.replyToken, "報名紀錄如下：", generateOrderListFlexMessage(orders), env);
        }
      }
    } else if (message?.content) {
      await replyToLINE(event.replyToken, message.content, null, env);
    }
  } catch (error) {
    console.error(error);
  }
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: 'text', text: text });
  if (flexMessage) messages.push(flexMessage);
  
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ replyToken, messages })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    await sendTelegramMessage(`❌ LINE 回覆失敗: ${errorBody}`, env);
  }
}
