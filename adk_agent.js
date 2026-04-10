import { getCourseCategories, getCourseList, createOrder, getUserOrders, cancelOrder } from './google_sheets_handler.js';
import { sendTelegramMessage } from './telegram_notifier.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

const tools = [
  {
    type: "function",
    function: {
      name: "getCourseCategories",
      description: "重要：僅在用戶詢問『一般性的課程、有哪些課』且未指定任何分類時呼叫，用來列出第一層分類選單。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getCourseList",
      description: "重要：當用戶訊息中已明確提到分類名稱（如一般、工作坊、蛻變階段、完整階段）時呼叫，用來列出該分類下的具體課程卡片。",
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
      description: "查詢當前使用者的報名紀錄、訂單狀態與匯款帳號資訊。",
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
  },
  {
    type: "function",
    function: {
      name: "cancelOrder",
      description: "取消使用者的特定報名訂單。",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string", description: "訂單編號" } },
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
        content: `你是專業課程客服。請依序執行以下邏輯，嚴禁跳回已完成的步驟：
1. 若用戶詢問『我的報名』、『報名紀錄』或『查詢進度』，必須立刻呼叫 getUserOrders。
2. 若用戶訊息中已帶有分類名稱（一般、工作坊、蛻變階段、完整階段），禁止呼叫 getCourseCategories，請直接呼叫 getCourseList 傳入該分類。
3. 僅在用戶完全沒說要看哪一類時，才呼叫 getCourseCategories 顯示首頁選單。
4. 若點擊報名按鈕（訊息含編號與金額），立刻呼叫 createOrder。
5. 取消報名請呼叫 cancelOrder。回覆需簡潔、專業、原生感。`
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
          aiResponseText = `單號 ${args.orderId} 的報名已提交取消申請。`;
          await sendTelegramMessage(`⚠️ 訂單取消：${userId}\n單號：${args.orderId}`, env);
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
