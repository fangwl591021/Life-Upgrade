import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile, cancelOrder } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

/**
 * 人生進化 Action - 意圖攔截器 (Hard Interceptor)
 * 確保功能指令 100% 物理隔離 AI 閒聊
 */
export async function handleAIRequest(event, env) {
  const rawMessage = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // 【物理鎖死】清洗所有干擾字元進行匹配
  const cleanMsg = rawMessage.replace(/[\s\u3000()（）:：,，]/g, "");

  try {
    // 1. 查看課程選單 (解決 image_2b6c7e.png 中的 AI 搶話問題)
    if (cleanMsg.includes("課程") || cleanMsg.includes("選單") || cleanMsg === "9") {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(replyToken, "請選擇您感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
      }
      // 【修復】資料庫異常時也必須 Return，不准流向 AI
      return await replyToLINE(replyToken, "課程系統目前維護中，請稍後輸入「看課程」重新查詢。", null, env);
    }

    // 2. 查詢預約紀錄 (Hard Return)
    if (cleanMsg.includes("我的預約") || cleanMsg.includes("紀錄")) {
      const orders = await getUserOrders(userId, env);
      if (orders && orders.length > 0) {
        return await replyToLINE(replyToken, "這是您的最新預約紀錄：", generateOrderListFlexMessage(orders), env);
      }
      return await replyToLINE(replyToken, "目前查無預約紀錄喔！快去看看精彩課程吧。", null, env);
    }

    // 3. 取消報名指令
    if (cleanMsg.includes("取消報名")) {
      const orderMatch = rawMessage.match(/單號\s*[:：]\s*([R0-9a-zA-Z]+)/i);
      if (orderMatch) {
        const orderId = orderMatch[1].trim();
        const result = await cancelOrder({ lineUid: userId, orderId: orderId }, env);
        const txt = result.status === "success" ? `單號 ${orderId} 預約已成功取消。🗑️` : `取消失敗：${result.message}`;
        return await replyToLINE(replyToken, txt, null, env);
      }
      return await replyToLINE(replyToken, "請在我的預約中點選取消按鈕。", null, env);
    }

    // 4. 預約報名指令
    if (cleanMsg.includes("我想預約") || (cleanMsg.includes("編號") && cleanMsg.includes("金額"))) {
      const orderMatch = rawMessage.match(/編號\s*[:：]\s*(.+?)\s*,\s*金額\s*[:：]\s*(\d+)/);
      if (orderMatch) {
        const courseId = orderMatch[1].trim();
        const amount = parseInt(orderMatch[2]);
        const profile = await getUserProfile(userId, env);
        if (!profile || !profile.name) {
          return await replyToLINE(replyToken, "您尚未完成註冊！\n請至「會員中心」填寫姓名，再進行預約。", null, env);
        }
        await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
        const orders = await getUserOrders(userId, env);
        return await replyToLINE(replyToken, "感謝預約！✨ 請點擊按鈕完成回報。", generateOrderListFlexMessage(orders), env);
      }
    }

    // 5. 特定分類查詢
    if (cleanMsg.includes("我想查詢") && cleanMsg.includes("課程")) {
      const catMatch = rawMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
      if (catMatch) {
        const catName = catMatch[1].trim();
        const courses = await getCourseList(catName, env);
        if (courses && courses.length > 0) {
          return await replyToLINE(replyToken, `這是「${catName}」的精選課程：`, generateCourseFlexMessage(courses), env);
        }
      }
    }

  } catch (err) {
    // 發生錯誤一律物理阻斷，回覆錯誤提示，絕不進入 AI 聊天引擎
    return await replyToLINE(replyToken, `系統繁忙，請稍後點選功能選單。\n(錯誤代碼: ${err.message.substring(0,10)})`, null, env);
  }

  // --- 【AI 客服區】僅當不具備任何關鍵字時觸發 ---
  return await callDualEngineAI(event, rawMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是專業客服。嚴格指令：1. 嚴禁虛構課程 2. 嚴禁閒聊 3. 嚴禁詢問興趣。若無法執行指令，請回覆：『抱歉，我只能協助本系統相關課程諮詢，請點選選單功能。』";
  try {
    const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] })
    });
    const oData = await oRes.json();
    const text = oData.choices?.[0]?.message?.content;
    if (text) return await replyToLINE(event.replyToken, text, null, env);
  } catch (e) {}
  await replyToLINE(event.replyToken, "系統稍忙，請直接使用功能選單查詢。", null, env);
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flexMessage) messages.push(flexMessage);
  await fetch("https://api.line.me/v2/bot/message/reply", { 
    method: "POST", 
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }, 
    body: JSON.stringify({ replyToken, messages }) 
  });
}
