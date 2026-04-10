import { getCourseCategories, getCourseList, createOrder, getUserOrders, cancelOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

const tools = [
  {
    type: "function",
    function: {
      name: "getCourseCategories",
      description: "查詢所有的課程分類清單",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getCourseList",
      description: "根據分類讀取課程詳細清單",
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
      description: "查詢當前使用者的所有報名紀錄與狀態",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "createOrder",
      description: "正式寫入預約報名紀錄",
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
      description: "取消特定的報名紀錄",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string", description: "訂單單號" } },
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
1. 用戶想看課程，呼叫 getCourseCategories。
2. 用戶想查詢『我的報名』、『報名紀錄』或『匯款資訊』，請呼叫 getUserOrders。
3. 若用戶訊息含『我想取消報名 (單號:[ID])』，請呼叫 cancelOrder。
4. 若用戶訊息含『我想回報匯款』，請提示用戶提供帳號末五碼，以便財務核對。
5. 預約成功後回覆：『已為您完成預約！後續將由專人與您聯繫。』回覆風格簡潔原生。`
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
          aiResponseText = "請選擇感興趣的課程類型：";
        } else if (fnName === 'getCourseList') {
          const courses = await getCourseList(args.category, env);
          flexMessage = generateCourseFlexMessage(courses);
          aiResponseText = `以下是「${args.category}」的課程細項：`;
        } else if (fnName === 'getUserOrders') {
          const orders = await getUserOrders(userId, env);
          if (orders.length > 0) {
            aiResponseText = "為您列出目前的報名狀態與匯款資訊：";
            flexMessage = generateOrderListFlexMessage(orders);
          } else {
            aiResponseText = "目前查無您的報名紀錄喔。";
          }
        } else if (fnName === 'createOrder') {
          await createOrder(userId, args.courseId, args.amount, env);
          aiResponseText = "已完成預約！後續將由專人聯繫。";
          await sendTelegramMessage(`✅ 新報名：${userId}\n課程：${args.courseId}`, env);
        } else if (fnName === 'cancelOrder') {
          await cancelOrder(args.orderId, env);
          aiResponseText = `單號 ${args.orderId} 的報名已為您提交取消申請。`;
          await sendTelegramMessage(`⚠️ 客戶取消：${userId}\n單號：${args.orderId}`, env);
        }
      }
    } else { aiResponseText = message.content; }

    await replyToLINE(event.replyToken, aiResponseText, flexMessage, env);
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
