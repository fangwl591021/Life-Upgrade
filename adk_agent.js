import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile, cancelOrder } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  try {
    // --- 【Manus 準則 1：核心功能攔截 - 執行後物理 Return】 ---

    // 1. 取消報名流程 (強效攔截)
    if (userMessage.indexOf("取消報名") !== -1) {
      const cancelMatch = userMessage.match(/單號\s*[:：]\s*([R0-9]+)/i);
      if (cancelMatch) {
        const orderId = cancelMatch[1].trim();
        const result = await cancelOrder({ lineUid: userId, orderId: orderId }, env);
        const txt = result.status === "success" ? `單號 ${orderId} 預約已成功取消。🗑️\n我們期待下次為您服務！` : `取消失敗：${result.message || '查無此訂單'}`;
        return await replyToLINE(event.replyToken, txt, null, env);
      }
    }

    // 2. 查詢紀錄
    if (userMessage.indexOf("我的預約") !== -1 || userMessage.indexOf("紀錄") !== -1) {
      const orders = await getUserOrders(userId, env);
      if (orders && orders.length > 0) {
        return await replyToLINE(event.replyToken, "這是您的最新預約紀錄：", generateOrderListFlexMessage(orders), env);
      }
      return await replyToLINE(event.replyToken, "目前查無預約紀錄喔！", null, env);
    }

    // 3. 預約指令
    if (userMessage.indexOf("我想預約") !== -1) {
      const orderMatch = userMessage.match(/編號\s*[:：]\s*(.+?)\s*,\s*金額\s*[:：]\s*(\d+)/);
      if (orderMatch) {
        const courseId = orderMatch[1].trim();
        const amount = parseInt(orderMatch[2]);
        const profile = await getUserProfile(userId, env);
        if (!profile || !profile.name) {
          return await replyToLINE(event.replyToken, "您尚未完成註冊喔！✨\n請至「會員中心」填寫姓名，再進行預約，謝謝。", null, env);
        }
        await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
        const orders = await getUserOrders(userId, env);
        return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊按鈕完成回報。", generateOrderListFlexMessage(orders), env);
      }
    }

    // 4. 第一層選單
    if (userMessage.indexOf("看課程") !== -1 || userMessage === "選單") {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(event.replyToken, "請選擇感興趣的課程階段：", generateCategoryFlexMessage(cats), env);
      }
    }

  } catch (err) {
    // 攔截區報錯，強制結束，絕對不准流向 AI
    return await replyToLINE(event.replyToken, `系統繁忙中，請點選功能選單重新操作。\n(錯誤資訊: ${err.message})`, null, env);
  }

  // --- 【Manus 準則 2：AI 服從性 - 嚴格限制閒聊】 ---
  return await callDualEngineAI(event, userMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是『人生進化 Action』專業客服。命令：嚴格禁止虛構課程，嚴格禁止閒聊。若問及非課程諮詢，請回覆：『抱歉，我只能協助本系統相關課程諮詢，請點選選單功能。』格式：不加粗、不包框、不主動詢問。";
  try {
    const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.OPENAI_API_KEY },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] })
    });
    const oData = await oRes.json();
    const text = oData.choices?.[0]?.message?.content;
    if (text) return await replyToLINE(event.replyToken, text, null, env);
  } catch (e) {}
  await replyToLINE(event.replyToken, "系統稍忙，請直接使用功能選單。", null, env);
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flexMessage) messages.push(flexMessage);
  await fetch("https://api.line.me/v2/bot/message/reply", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN }, body: JSON.stringify({ replyToken: replyToken, messages: messages }) });
}
