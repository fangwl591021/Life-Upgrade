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
      description: "正式提交報名，在試算表中建立新訂單。",
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
  }
];

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 1. 超快速路徑 (優先權最高，絕對攔截) ---

  // A. 預約報名攔截 (只要偵測到編號與金額格式，不論前後文字，直接報名)
  const orderMatch = userMessage.match(/\(編號[\s\u3000]*:[\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*:[\s\u3000]*(\d+)\)/);
  if (orderMatch) {
    const courseId = orderMatch[1].trim();
    const amount = parseInt(orderMatch[2]);
    try {
      await createOrder(userId, courseId, amount, env);
      await sendTelegramMessage(`✅ 報名成功錄入！\nUID: ${userId}\n課程: ${courseId}\n金額: ${amount}`, env);
      return await replyToLINE(event.replyToken, "已為您完成預約！後續將由專人聯繫您安排匯款細節。", null, env);
    } catch (e) {
      await sendTelegramMessage(`❌ 報名寫入失敗: ${e.message}`, env);
      return await replyToLINE(event.replyToken, "報名程序發生錯誤，請稍後再試或聯繫客服。", null, env);
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

  // C. 特定分類查詢
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const cat = categoryMatch[1].trim();
    const courses = await getCourseList(cat, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, `以下是「${cat}」的課程細項：`, generateCourseFlexMessage(courses), env);
    } else {
      return await replyToLINE(event.replyToken, `抱歉，目前「${cat}」分類下暫無課程。`, null, env);
    }
  }

  // D. 課程首頁
  if (userMessage === '我想看課程' || userMessage === '有哪些課程' || userMessage === '課程列表') {
    const cats = await getCourseCategories(env);
    return await replyToLINE(event.replyToken, "請選擇感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
  }

  // --- 2. AI 路徑 (處理閒聊或非結構化指令) ---
  const requestBody = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `你是專業課程客服。
1. **嚴禁反問**：若用戶想看課程，請立刻呼叫工具展示 Flex Message。
2. **報名處理**：若訊息含(編號:..., 金額:...)，這絕對是報名請求，請直接呼叫 createOrder。
3. **查紀錄**：若詢問我的報名，呼叫 getUserOrders。
4. 回覆需極簡，原生 LINE 格式。`
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
          aiResponseText = "已完成預約！後續將由專人聯繫您。";
        }
      }
    } else {
      aiResponseText = message?.content || "";
    }

    if (aiResponseText || flexMessage) {
      await replyToLINE(event.replyToken, aiResponseText, flexMessage, env);
    }
  } catch (error) {
    console.error(error);
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
