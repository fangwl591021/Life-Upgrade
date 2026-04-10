import { getCourseCategories, getCourseList, createOrder, getUserOrders, cancelOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

const tools = [
  {
    type: "function",
    function: {
      name: "getCourseCategories",
      description: "查詢所有可用的課程分類（如：一般、工作坊等）。僅當用戶沒提到具體類別時才使用。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getCourseList",
      description: "根據類別獲取具體課程清單。當訊息中包含『一般』、『工作坊』、『蛻變』或『完整』時，必須優先呼叫此功能。",
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
      description: "建立新報名訂單。",
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
  const userMessage = event.message.text;
  const userId = event.source.userId;

  const requestBody = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `你是專業課程客服。
1. **嚴禁反問**：禁止使用文字詢問用戶想看哪種分類。若用戶想看課程，請直接呼叫 getCourseCategories 或 getCourseList（若已提到關鍵字）。
2. **優先級**：若訊息含『一般』、『工作坊』、『蛻變』或『完整』，立即呼叫 getCourseList。
3. **查詢紀錄**：若訊息含『報名』、『紀錄』、『我的』，立即呼叫 getUserOrders。
4. **一鍵執行**：嚴格執行工具呼叫，不要進行多餘的對話。
5. 報名成功回覆：『已為您完成預約！後續將由專人聯繫。』`
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
        const args = JSON.parse(toolCall.function.arguments);

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
            aiResponseText = "這是您的報名紀錄：";
          } else {
            aiResponseText = "查無您的報名紀錄。";
          }
        } else if (fnName === 'createOrder') {
          await createOrder(userId, args.courseId, args.amount, env);
          aiResponseText = "已完成預約！後續由專人聯繫。";
          await sendTelegramMessage(`✅ 新報名：${userId}`, env);
        } else if (fnName === 'cancelOrder') {
          await cancelOrder(args.orderId, env);
          aiResponseText = `單號 ${args.orderId} 已申請取消。`;
        }
      }
    } else {
      aiResponseText = message.content;
    }

    if (aiResponseText || flexMessage) {
      await replyToLINE(event.replyToken, aiResponseText, flexMessage, env);
    }
  } catch (error) { console.error(error); }
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
