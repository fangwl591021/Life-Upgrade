/**
 * 人生進化 Action - 指令硬攔截核心 (adk_agent.js)
 * 物理鎖死：只要訊息包含關鍵字，執行流必須強制 Return，禁止 AI 介入。
 */
import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile, cancelOrder } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const rawMessage = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // 全字元清洗匹配 (解決空格、全半形、括號干擾)
  const cleanMsg = rawMessage.replace(/[\s\u3000()（）:：,，]/g, "");

  try {
    // 1. 查看選單 (最高優先權 - 找回原本成功的 FLEX 流程)
    if (cleanMsg.includes("看課程") || cleanMsg.includes("課程選單") || cleanMsg === "選單") {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(replyToken, "最近有很多精彩課程，請選擇您感興趣的類型：", generateCategoryFlexMessage(cats), env);
      }
      return await replyToLINE(replyToken, "系統資料庫連線中，請稍後輸入「看課程」重新查詢。", null, env);
    }

    // 2. 查詢預約紀錄
    if (cleanMsg.includes("我的預約") || cleanMsg.includes("紀錄")) {
      const orders = await getUserOrders(userId, env);
      if (orders && orders.length > 0) {
        return await replyToLINE(replyToken, "這是您的最新預約紀錄：", generateOrderListFlexMessage(orders), env);
      }
      return await replyToLINE(replyToken, "目前查無預約紀錄喔！快去看看精彩課程吧。", null, env);
    }

    // 3. 取消報名指令 (強制攔截)
    if (cleanMsg.includes("取消報名")) {
      const orderMatch = rawMessage.match(/單號\s*[:：]\s*([R0-9a-zA-Z]+)/i);
      if (orderMatch) {
        const orderId = orderMatch[1].trim();
        const result = await cancelOrder({ lineUid: userId, orderId: orderId }, env);
        const txt = result.status === "success" ? `單號 ${orderId} 預約已成功取消。🗑️` : `取消失敗：${result.message}`;
        return await replyToLINE(replyToken, txt, null, env);
      }
      return await replyToLINE(replyToken, "請於預約紀錄中點擊取消按鈕。", null, env);
    }

    // 4. 預約報名意圖
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
        return await replyToLINE(replyToken, "感謝您的預約！✨ 請點擊按鈕完成回報。", generateOrderListFlexMessage(orders), env);
      }
    }
  } catch (err) {
    // 攔截區報錯：物理阻斷 AI，回傳系統錯誤並強制結束
    return await replyToLINE(replyToken, "系統忙碌中，請點選功能選單重新查詢。", null, env);
  }

  // --- 【AI 引擎區】僅當不符合以上所有關鍵字時觸發 ---
  return await callDualEngineAI(event, rawMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是專業客服。核心命令：1. 嚴禁虛構課程 2. 嚴禁閒聊 3. 嚴禁詢問興趣。若指令無效，請回覆：『抱歉，我只能協助本系統課程諮詢，請點選功能選單。』";
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
  await replyToLINE(event.replyToken, "系統稍忙，請直接使用功能選單。", null, env);
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
