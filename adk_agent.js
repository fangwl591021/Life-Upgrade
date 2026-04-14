import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile, cancelOrder } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const rawMessage = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  const cleanMsg = rawMessage.replace(/[\s\u3000()（）:：,，]/g, "");

  try {
    // 1. 取消報名 (優先鎖死)
    if (cleanMsg.includes("取消報名")) {
      const orderMatch = rawMessage.match(/單號\s*[:：]\s*([R0-9a-zA-Z]+)/i);
      if (orderMatch) {
        const orderId = orderMatch[1].trim();
        const result = await cancelOrder({ lineUid: userId, orderId: orderId }, env);
        return await replyToLINE(replyToken, result.status === "success" ? `單號 ${orderId} 預約已成功取消。🗑️` : `取消失敗：${result.message}`, null, env);
      }
      return await replyToLINE(replyToken, "請於預約紀錄中點擊取消按鈕。", null, env);
    }

    // 2. 查看選單 (修正 FLEX 不出現問題)
    if (cleanMsg.includes("看課程") || cleanMsg === "選單" || cleanMsg === "報名" || cleanMsg === "9") {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(replyToken, "最近有很多精彩課程，請選擇您感興趣的類型：", generateCategoryFlexMessage(cats), env);
      }
      return await replyToLINE(replyToken, "目前課程資料庫連線中，請稍後再試。", null, env);
    }

    // 3. 查詢紀錄
    if (cleanMsg.includes("我的預約") || cleanMsg.includes("紀錄")) {
      const orders = await getUserOrders(userId, env);
      if (orders && orders.length > 0) {
        return await replyToLINE(replyToken, "這是您的最新預約紀錄：", generateOrderListFlexMessage(orders), env);
      }
      return await replyToLINE(replyToken, "目前查無預約紀錄喔！", null, env);
    }

    // 4. 分類細項
    if (cleanMsg.includes("我想查詢") && cleanMsg.includes("的課程")) {
      const catMatch = rawMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
      if (catMatch) {
        const catName = catMatch[1].trim();
        const courses = await getCourseList(catName, env);
        if (courses && courses.length > 0) return await replyToLINE(replyToken, `這是「${catName}」的精選課程：`, generateCourseFlexMessage(courses), env);
      }
      return await replyToLINE(replyToken, "抱歉，找不到該分類資訊。", null, env);
    }

    // 5. 預約指令
    if (cleanMsg.includes("我想預約")) {
      const orderMatch = rawMessage.match(/編號\s*[:：]\s*(.+?)\s*,\s*金額\s*[:：]\s*(\d+)/);
      if (orderMatch) {
        const courseId = orderMatch[1].trim();
        const amount = parseInt(orderMatch[2]);
        const profile = await getUserProfile(userId, env);
        if (!profile || !profile.name) return await replyToLINE(replyToken, "您尚未完成註冊！\n請至「會員中心」填寫姓名。", null, env);
        await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
        const orders = await getUserOrders(userId, env);
        return await replyToLINE(replyToken, "感謝預約！✨ 請點擊按鈕完成回報。", generateOrderListFlexMessage(orders), env);
      }
    }

  } catch (err) {
    return await replyToLINE(replyToken, "系統處理中，請點選選單重新操作。", null, env);
  }

  return await callDualEngineAI(event, rawMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是人生進化專業客服。禁止虛構課程，禁止閒聊。非課程事宜請回：『抱歉，我只能協助本系統課程諮詢，請點選選單。』格式：不加粗、不包框。";
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
  await fetch("https://api.line.me/v2/bot/message/reply", { 
    method: "POST", 
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN }, 
    body: JSON.stringify({ replyToken: replyToken, messages: messages }) 
  });
}
