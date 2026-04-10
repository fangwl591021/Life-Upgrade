import { getCourseCategories, getCourseList, createOrder, getUserOrders, cancelOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

const tools = [
  {
    type: "function",
    function: {
      name: "getCourseCategories",
      description: "顯示首頁的課程分類選單。僅在用戶未指定分類且想看課程時呼叫。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getCourseList",
      description: "顯示特定分類（一般、工作坊、蛻變階段、完整階段）的課程清單。若已知分類，優先呼叫此功能。",
      parameters: {
        type: "object",
        properties: { category: { type: "string", description: "分類名稱" } },
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
      description: "正式寫入報名資料到試算表中。",
      parameters: {
        type: "object",
        properties: {
          lineUid: { type: "string" },
          courseId: { type: "string" },
          amount: { type: "number" }
        },
        required: ["lineUid", "courseId", "amount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "cancelOrder",
      description: "取消特定訂單單號。",
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

  // --- 1. 超快速路徑 (完全不經過 AI) ---
  
  // 處理「我的報名」相關關鍵字
  if (userMessage.includes('我的報名') || userMessage.includes('報名紀錄') || userMessage.includes('查詢報名')) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您的報名紀錄：", generateOrderListFlexMessage(orders), env);
    } else {
      return await replyToLINE(event.replyToken, "目前查無您的報名紀錄喔。", null, env);
    }
  }

  // 處理課程分類按鈕 (格式：我想查詢 XXX 的課程)
  const categoryMatch = userMessage.match(/我想查詢\s*(.+)\s*的課程/);
  if (categoryMatch) {
    const cat = categoryMatch[1].trim();
    const courses = await getCourseList(cat, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, `以下是「${cat}」的課程細項：`, generateCourseFlexMessage(courses), env);
    } else {
      return await replyToLINE(event.replyToken, `抱歉，目前「${cat}」分類下暫無課程。`, null, env);
    }
  }

  // 處理「我想看課程」首頁
  if (userMessage === '我想看課程' || userMessage === '有哪些課程') {
    const cats = await getCourseCategories(env);
    return await replyToLINE(event.replyToken, "請選擇感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
  }

  // --- 2. AI 路徑 (處理複雜對話) ---
  const requestBody = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `你是專業課程客服。
1. **禁止反問**：若用戶想看課程，請立刻呼叫工具展示 Flex Message。
2. **禁止鬼打牆**：若已知道用戶要看哪一類（一般、工作坊等），必須呼叫 getCourseList，禁止跳回首頁選單。
3. **查報名**：若詢問紀錄，呼叫 getUserOrders。
4. 回覆簡潔，模擬 LINE OA 客服風格。`
      },
      { role: "user", content: userMessage }
    ],
    tools: tools,
    tool_choice: "auto"
  };

  try {
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    const data = await gptRes.json();
    const message = data.choices[0]?.message;

    let aiResponseText = '';
    let flexMessage = null;

    if (message?.tool_calls) {
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        if (fnName === 'getCourseCategories') {
          const cats = await getCourseCategories(env);
          flexMessage = generateCategoryFlexMessage(cats);
          aiResponseText = "為您列出課程類型：";
        } else if (fnName === 'getCourseList') {
          const courses = await getCourseList(args.category, env);
          flexMessage = generateCourseFlexMessage(courses);
          aiResponseText = `「${args.category}」的課程如下：`;
        } else if (fnName === 'getUserOrders') {
          const orders = await getUserOrders(userId, env);
          if (orders.length > 0) {
            flexMessage = generateOrderListFlexMessage(orders);
            aiResponseText = "這是您的報名紀錄：";
          } else {
            aiResponseText = "查無報名紀錄。";
          }
        } else if (fnName === 'createOrder') {
          await createOrder(userId, args.courseId, args.amount, env);
          aiResponseText = "已完成預約！後續專人聯繫。";
        } else if (fnName === 'cancelOrder') {
          await cancelOrder(args.orderId, env);
          aiResponseText = `單號 ${args.orderId} 已申請取消。`;
        }
      }
    } else {
      aiResponseText = message?.content || "";
    }

    if (aiResponseText || flexMessage) {
      await replyToLINE(event.replyToken, aiResponseText, flexMessage, env);
    } else {
      // 確保至少回一句話，避免停掉
      await replyToLINE(event.replyToken, "收到您的訊息，處理中...", null, env);
    }
  } catch (error) {
    await sendTelegramMessage(`❌ AI 處理失敗: ${error.message}`, env);
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
