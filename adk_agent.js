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
  },
  {
    type: "function",
    function: {
      name: "createOrder",
      description: "正式提交初步預約，在試算表中建立新訂單。",
      parameters: {
        type: "object",
        properties: {
          lineUid: { type: "string" },
          courseId: { type: "string" },
          courseName: { type: "string" },
          amount: { type: "number" }
        },
        required: ["lineUid", "courseId", "courseName", "amount"]
      }
    }
  }
];

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 1. 超快速路徑 (優先權最高) ---

  // A. 預約報名攔截
  const orderMatch = userMessage.match(/我想預約\s*(.+?)\s*\(編號\s*:\s*(.+?)\s*,\s*金額\s*:\s*(\d+)\)/);
  if (orderMatch) {
    const courseName = orderMatch[1].trim();
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      await createOrder(userId, courseId, amount, env);
      
      // 發送初步預約通知
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      const notifyText = `✅ 新預約申請通知\n------------------\n🆔 訂單編號 : 待產生\n👤 Line UID : ${userId}\n📚 課程名稱 : ${courseName}\n💰 預約金額 : ${amount} 元\n🗓️ 預約時間 : ${now}`;
      await sendTelegramMessage(notifyText, env);
      
      return await replyToLINE(event.replyToken, "已為您完成預約！後續將由專人聯繫您安排匯款細節。", null, env);
    } catch (e) {
      return await replyToLINE(event.replyToken, "預約程序發生錯誤，請稍後再試。", null, env);
    }
  }

  // B. 我的報名
  if (userMessage.includes('我的報名') || userMessage.includes('報名紀錄') || userMessage.includes('查詢報名')) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您的報名紀錄：", generateOrderListFlexMessage(orders), env);
    } else {
      return await replyToLINE(event.replyToken, "目前查無您的報名紀錄喔。", null, env);
    }
  }

  // C. 分類查詢與首頁 (略，維持原邏輯)
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

  // --- 2. AI 路徑 (處理其餘對話) ---
  const requestBody = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `你是專業課程客服。
1. **報名處理**：若偵測到報名意圖且有課程資訊，請呼叫 createOrder。
2. 回覆風格簡潔，模擬 LINE OA 原生格式。`
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

        if (fnName === 'getUserOrders') {
          const orders = await getUserOrders(userId, env);
          await replyToLINE(event.replyToken, orders.length > 0 ? "這是您的報名紀錄：" : "查無報名紀錄。", generateOrderListFlexMessage(orders), env);
        } else if (fnName === 'createOrder') {
          await createOrder(userId, args.courseId, args.amount, env);
          await replyToLINE(event.replyToken, "已完成初步預約！", null, env);
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
