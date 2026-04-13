import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile, cancelOrder } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const rawMessage = event.message.text.trim();
  const userId = event.source.userId;

  // 【物理攔截：全字元清洗】
  const cleanMsg = rawMessage.replace(/[\s\u3000()（）:：,，]/g, "");

  // --- 【Manus 準則 1：物理攔截區 - 執行後絕對 Return，嚴禁穿透至 AI】 ---
  try {
    // 1. 取消報名
    if (cleanMsg.includes("取消報名")) {
      const orderMatch = rawMessage.match(/單號\s*[:：]\s*([R0-9a-zA-Z]+)/i);
      if (orderMatch) {
        const orderId = orderMatch[1].trim();
        const result = await cancelOrder({ lineUid: userId, orderId: orderId }, env);
        return await replyToLINE(event.replyToken, result.status === "success" ? `單號 ${orderId} 預約已成功取消。🗑️` : `取消失敗：${result.message}`, null, env);
      }
      return await replyToLINE(event.replyToken, "請點選預約紀錄中的取消按鈕進行操作。", null, env);
    }

    // 2. 查看選單 (修正圖片中的故障點)
    if (cleanMsg.includes("看課程") || cleanMsg === "選單" || cleanMsg === "報名") {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(event.replyToken, "請選擇感興趣的課程階段：", generateCategoryFlexMessage(cats), env);
      }
      // 【修復】即使資料庫空值也必須 return，不准流向 AI
      return await replyToLINE(event.replyToken, "目前課程資料庫更新中，請稍後再試。", null, env);
    }

    // 3. 查詢紀錄
    if (cleanMsg.includes("我的預約") || cleanMsg.includes("紀錄")) {
      const orders = await getUserOrders(userId, env);
      if (orders && orders.length > 0) {
        return await replyToLINE(event.replyToken, "這是您的最新預約紀錄：", generateOrderListFlexMessage(orders), env);
      }
      return await replyToLINE(event.replyToken, "目前查無您的預約紀錄喔！", null, env);
    }

    // 4. 分類細項
    if (cleanMsg.includes("我想查詢") && cleanMsg.includes("的課程")) {
      const catMatch = rawMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
      if (catMatch) {
        const catName = catMatch[1].trim();
        const courses = await getCourseList(catName, env);
        if (courses && courses.length > 0) return await replyToLINE(event.replyToken, `這是「${catName}」的精選課程：`, generateCourseFlexMessage(courses), env);
      }
      return await replyToLINE(event.replyToken, "抱歉，找不到該分類的課程資訊。", null, env);
    }

    // 5. 預約指令
    if (cleanMsg.includes("我想預約") || (cleanMsg.includes("編號") && cleanMsg.includes("金額"))) {
      const orderMatch = rawMessage.match(/編號\s*[:：]\s*(.+?)\s*,\s*金額\s*[:：]\s*(\d+)/);
      if (orderMatch) {
        const courseId = orderMatch[1].trim();
        const amount = parseInt(orderMatch[2]);
        const profile = await getUserProfile(userId, env);
        if (!profile || !profile.name) return await replyToLINE(event.replyToken, "您尚未完成學員註冊！\n請至「會員中心」填寫姓名，再進行預約。", null, env);
        await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
        const orders = await getUserOrders(userId, env);
        return await replyToLINE(event.replyToken, "感謝預約！✨ 請點擊按鈕完成回報。", generateOrderListFlexMessage(orders), env);
      }
    }

  } catch (err) {
    // 物理阻斷：攔截區報錯一律不准進入 AI
    return await replyToLINE(event.replyToken, "系統處理中，請稍後重新點選選單。", null, env);
  }

  // --- 【Manus 準則 2：AI 服從性區 - 嚴格限制閒聊】 ---
  return await callDualEngineAI(event, rawMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是『人生進化 Action』專業客服。命令：嚴格禁止虛構課程，嚴格禁止閒聊。若問及非課程諮詢，請回覆：『抱歉，我只能協助本系統相關課程諮詢，請參考功能選單。』格式：不加粗、不包框、不主動詢問。";
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
