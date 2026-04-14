/**
 * 人生進化 Action - 意圖硬攔截核心 (adk_agent.js)
 * 物理鎖死：關鍵字命中後 100% 阻斷 AI 閒聊，且確保一定會有回應。
 */
import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile, cancelOrder } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const rawMsg = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // 全字元清洗匹配
  const cleanMsg = rawMsg.replace(/[\s\u3000()（）:：,，]/g, "");

  try {
    // 1. 【硬攔截】課程選單 - 物理隔離 AI
    if (cleanMsg.includes("看課程") || cleanMsg.includes("選單") || cleanMsg === "9") {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(replyToken, "請選擇感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
      }
      return await replyToLINE(replyToken, "目前資料庫連線中，請稍後輸入「選單」重新查詢。", null, env);
    }

    // 2. 預約紀錄攔截
    if (cleanMsg.includes("我的預約") || cleanMsg.includes("紀錄")) {
      const orders = await getUserOrders(userId, env);
      if (orders && orders.length > 0) {
        return await replyToLINE(replyToken, "這是您的最新預約紀錄：", generateOrderListFlexMessage(orders), env);
      }
      return await replyToLINE(replyToken, "目前查無預約紀錄喔！快去看看精彩課程吧。", null, env);
    }

    // 3. 取消報名指令
    if (cleanMsg.includes("取消報名")) {
      const orderMatch = rawMsg.match(/單號\s*[:：]\s*([R0-9a-zA-Z]+)/i);
      if (orderMatch) {
        const orderId = orderMatch[1].trim();
        const result = await cancelOrder({ lineUid: userId, orderId: orderId }, env);
        const txt = result.status === "success" ? `單號 ${orderId} 預約已成功取消。🗑️` : `取消失敗：${result.message}`;
        return await replyToLINE(replyToken, txt, null, env);
      }
    }

    // 4. 特定分類查詢
    if (cleanMsg.includes("我想查詢") && cleanMsg.includes("課程")) {
      const catMatch = rawMsg.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
      if (catMatch) {
        const catName = catMatch[1].trim();
        const courses = await getCourseList(catName, env);
        if (courses && courses.length > 0) {
          return await replyToLINE(replyToken, `這是「${catName}」的精選課程：`, generateCourseFlexMessage(courses), env);
        }
      }
    }

    // --- 若非上述關鍵字，才進入 AI 區域 ---
    return await callDualEngineAI(event, rawMsg, env);

  } catch (err) {
    // 物理阻斷：即便報錯也必須回覆 LINE，不能沒反應
    console.error("ADK Agent Error:", err);
    return await replyToLINE(replyToken, "系統連線繁忙，請點選功能選單重新嘗試。", null, env);
  }
}

async function callDualEngineAI(event, msg, env) {
  const prompt = "你是『人生進化 Action』專業客服。嚴格指令：禁止閒聊、禁止詢問興趣。非指令請回：『抱歉，我只能協助課程諮詢，請點選功能選單。』";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: prompt }, { role: "user", content: msg }] })
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (text) return await replyToLINE(event.replyToken, text, null, env);
  } catch (e) {}
  // 兜底回覆
  await replyToLINE(event.replyToken, "系統稍忙，請直接使用功能選單查詢。", null, env);
}

async function replyToLINE(replyToken, text, flex, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flex) messages.push(flex);
  
  // 核心檢查：如果沒有 Token 則無法回覆
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error("Missing LINE_CHANNEL_ACCESS_TOKEN");
    return;
  }

  await fetch("https://api.line.me/v2/bot/message/reply", { 
    method: "POST", 
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, 
    body: JSON.stringify({ replyToken, messages }) 
  });
}
