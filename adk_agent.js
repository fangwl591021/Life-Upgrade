/**
 * 人生進化 Action - 指令攔截器 (Hard Interceptor)
 * 物理鎖死：命中關鍵字後強制執行 Return，杜絕 AI 閒聊。
 */
import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile, cancelOrder } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const rawMsg = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // 全字元清洗匹配
  const cleanMsg = rawMsg.replace(/[\s\u3000()（）:：,，]/g, "");

  // --- 【Manus 準則：物理攔截區 - 找回成功流程】 ---
  try {
    // 1. 課程選單攔截 (找回 FLEX 流程)
    if (cleanMsg.includes("課程") || cleanMsg.includes("選單") || cleanMsg === "我想報名" || cleanMsg === "9") {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(replyToken, "請選擇您感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
      }
      return await replyToLINE(replyToken, "資料庫連線中，請稍後輸入「選單」重新查詢。", null, env);
    }

    // 2. 預約紀錄攔截
    if (cleanMsg.includes("我的預約") || cleanMsg.includes("紀錄")) {
      const orders = await getUserOrders(userId, env);
      if (orders && orders.length > 0) {
        return await replyToLINE(replyToken, "這是您的最新預約紀錄：", generateOrderListFlexMessage(orders), env);
      }
      return await replyToLINE(replyToken, "目前查無預約紀錄喔！", null, env);
    }

    // 3. 取消報名攔截
    if (cleanMsg.includes("取消報名")) {
      const orderMatch = rawMsg.match(/單號\s*[:：]\s*([R0-9a-zA-Z]+)/i);
      if (orderMatch) {
        const orderId = orderMatch[1].trim();
        const result = await cancelOrder({ lineUid: userId, orderId: orderId }, env);
        const txt = result.status === "success" ? `單號 ${orderId} 預約已成功取消。🗑️` : `取消失敗：${result.message}`;
        return await replyToLINE(replyToken, txt, null, env);
      }
    }

    // 4. 分類課程查詢
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

  } catch (err) {
    // 物理隔離：發生錯誤也必須阻斷執行流，不准流向 AI
    return await replyToLINE(replyToken, "系統繁忙中，請點選功能選單重新嘗試。", null, env);
  }

  // --- 【AI 客服區】僅當不具備功能關鍵字時觸發 ---
  return await callDualEngineAI(event, rawMsg, env);
}

async function callDualEngineAI(event, msg, env) {
  const systemPrompt = "你是專業客服。嚴格指令：禁止虛構課程、禁止閒聊、禁止主動發問。非課程事宜回覆：『抱歉，我只能協助系統課程諮詢，請點選功能選單。』格式：不加粗、不包框。";
  try {
    const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.OPENAI_API_KEY },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: msg }] })
    });
    const oData = await oRes.json();
    const text = oData.choices?.[0]?.message?.content;
    if (text) return await replyToLINE(event.replyToken, text, null, env);
  } catch (e) {}
  await replyToLINE(event.replyToken, "系統稍忙，請直接使用選單查詢。", null, env);
}

async function replyToLINE(replyToken, text, flex, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flex) messages.push(flex);
  await fetch("https://api.line.me/v2/bot/message/reply", { 
    method: "POST", 
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN }, 
    body: JSON.stringify({ replyToken, messages }) 
  });
}
