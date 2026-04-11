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
      description: "查詢當前用戶的所有報名紀錄、訂單狀態與匯款資訊。",
      parameters: { type: "object", properties: {} }
    }
  }
];

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 1. 超快速路徑 (優先權最高) ---

  // A. 預約報名攔截 (優化：語氣溫暖化並自動顯示紀錄)
  const orderMatch = userMessage.match(/我想預約\s*(.+?)\s*\(編號\s*:\s*(.+?)\s*,\s*金額\s*:\s*(\d+)\)/);
  if (orderMatch) {
    const courseName = orderMatch[1].trim();
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      // 呼叫 GAS 建立訂單
      await createOrder(userId, courseId, amount, env);
      
      // 成功後，不只是文字，直接抓取最新的訂單紀錄
      const orders = await getUserOrders(userId, env);
      const flexMessage = generateOrderListFlexMessage(orders);
      const warmText = "感謝您的預約！請點擊下方按鈕完成匯款回報，期待在課程中與您相見歡，一起探索生命的無限可能！";

      // 同步發送 Telegram 通知
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      const notifyText = `✅ 新預約申請通知\n------------------\n👤 Line UID : ${userId}\n📚 課程名稱 : ${courseName}\n💰 預約金額 : ${amount} 元\n🗓️ 預約時間 : ${now}`;
      await sendTelegramMessage(notifyText, env);

      return await replyToLINE(event.replyToken, warmText, flexMessage, env);
    } catch (e) {
      return await replyToLINE(event.replyToken, "抱歉，預約過程中發生一點小問題，請稍後再試。", null, env);
    }
  }

  // B. 我的報名 / 我的預約
  if (userMessage.includes('我的報名') || userMessage.includes('報名紀錄') || userMessage.includes('查詢報名') || userMessage.includes('我的預約')) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您目前的報名紀錄：", generateOrderListFlexMessage(orders), env);
    } else {
      return await replyToLINE(event.replyToken, "目前查無您的報名紀錄喔，快去看看有什麼好課吧！", null, env);
    }
  }

  // C. 分類查詢與首頁
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const cat = categoryMatch[1].trim();
    const courses = await getCourseList(cat, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, `以下是「${cat}」的課程細項：`, generateCourseFlexMessage(courses), env);
    }
  }

  if (userMessage === '我想看課程' || userMessage === '有哪些課程') {
    const cats = await getCourseCategories(env);
    return await replyToLINE(event.replyToken, "請選擇感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
  }

  // --- 2. AI 路徑 (處理閒聊或模糊指令) ---
  const requestBody = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `你是專業課程客服。
1. **語氣**：溫暖、體貼、有禮貌。
2. **行為**：用戶提到想看報名或預約，優先呼叫 getUserOrders 展示卡片。
3. 嚴禁使用包框或加粗字體。`
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
    const message = data.choices[0]?.message;

    if (message?.tool_calls) {
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        if (fnName === 'getCourseCategories') {
          const cats = await getCourseCategories(env);
          await replyToLINE(event.replyToken, "為您列出目前的課程類型：", generateCategoryFlexMessage(cats), env);
        } else if (fnName === 'getUserOrders') {
          const orders = await getUserOrders(userId, env);
          await replyToLINE(event.replyToken, "這是您的報名與預約紀錄：", generateOrderListFlexMessage(orders), env);
        }
      }
    } else if (message?.content) {
      await replyToLINE(event.replyToken, message.content, null, env);
    }
  } catch (error) {}
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
