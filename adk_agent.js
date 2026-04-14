/**
 * 人生進化 Action - 意圖硬攔截核心 (adk_agent.js)
 * 物理鎖死：命中關鍵字後強制 Return，絕對不准 AI 搶話。
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
    // 1. 查看選單 (還原 5:47 PM 成功流程：生成圖片 FLEX)
    if (cleanMsg.includes("看課程") || cleanMsg.includes("選單") || cleanMsg === "我想報名" || cleanMsg === "9") {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(replyToken, "請選擇您感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
      }
      return await replyToLINE(replyToken, "目前資料庫更新中，請稍後輸入「選單」重試。", null, env);
    }

    // 2. 我的預約紀錄
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

  } catch (err) {
    // 物理隔離 AI：報錯時也必須中斷執行序
    return await replyToLINE(replyToken, "系統連線繁忙，請點選選單重新嘗試。", null, env);
  }

  // --- 僅非功能性關鍵字時觸發 AI ---
  return await callDualEngineAI(event, rawMsg, env);
}

async function callDualEngineAI(event, msg, env) {
  const systemPrompt = "你是專業客服。嚴格指令：1. 禁止虛構課程 2. 禁止閒聊。非指令請回：『抱歉，我只能協助本系統課程諮詢，請點選功能選單。』";
  try {
    const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: msg }] })
    });
    const oData = await oRes.json();
    const text = oData.choices?.[0]?.message?.content;
    if (text) return await replyToLINE(event.replyToken, text, null, env);
  } catch (e) {}
  await replyToLINE(event.replyToken, "系統稍忙，請直接使用功能選單。", null, env);
}

async function replyToLINE(replyToken, text, flex, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flex) messages.push(flex);
  await fetch("https://api.line.me/v2/bot/message/reply", { 
    method: "POST", 
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }, 
    body: JSON.stringify({ replyToken, messages }) 
  });
}
