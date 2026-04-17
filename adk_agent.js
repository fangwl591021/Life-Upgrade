/**
 * 人生進化 Action - 核心大腦 (adk_agent.js)
 * 升級：切換至 GPT-4o 語義大腦 + 物理隔離指令
 * 修正：強化 WP 指令過濾，確保共用 OA 不干擾
 */
import { getCourseCategories, getCourseList } from './google_sheets_handler.js';
import { generateIntroGigaFlex, generateCourseFlexMessage } from './message_templates.js';

// WP 專屬關鍵字：AI 遇到這些字眼會保持沉默，讓 WP 處理
const WP_EXCLUSIVE_COMMANDS = ["會員專區", "登入", "註冊", "綁定", "我的帳號", "測試", "Little Sweetness"];

export async function handleAIRequest(event, env) {
  const rawMessage = (event.message.text || "").trim();
  const cleanMsg = rawMessage.replace(/[\s\u3000]/g, "");
  const replyToken = event.replyToken;

  // 1. 【路由過濾層】WP 指令攔截：絕對沉默，不准搶話
  if (WP_EXCLUSIVE_COMMANDS.some(cmd => cleanMsg.includes(cmd))) {
    return; 
  }

  // 2. 【物理隔離層】系統級指令 (不進 AI)
  
  // 檢測指令：檢查 GPT-4o 與 GAS 連線
  if (cleanMsg === "檢測") {
    try {
      const start = Date.now();
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      });
      const aiStatus = res.ok ? "🟢 GPT-4o 正常" : `🔴 AI 異常 (${res.status})`;
      const cats = await getCourseCategories(env);
      const gasStatus = (cats && cats.length > 0) ? `🟢 GAS 正常 (${cats.length}筆)` : "🔴 GAS 無資料";
      return await replyToLINE(replyToken, `【系統診斷報告】\n大腦：${aiStatus}\n資料庫：${gasStatus}\n耗時：${Date.now() - start}ms`, env);
    } catch (e) {
      return await replyToLINE(replyToken, `❌ 診斷失敗：${e.message}`, env);
    }
  }

  // 指令 111
  if (cleanMsg === "111") {
    return await replyToLINE(replyToken, "想了解哪種課程", env);
  }

  // 指令 9 (選單)
  if (cleanMsg === "9" || cleanMsg === "選單") {
    const cats = await getCourseCategories(env);
    if (!cats || cats.length === 0) return await replyToLINE(replyToken, "⚠️ 無法讀取課程分類，請確認試算表 M 欄。", env);
    return await replyToLINE(replyToken, null, generateIntroGigaFlex(cats), env);
  }

  // 3. 【語義解析層】使用 GPT-4o
  try {
    const systemPrompt = `你是一個專業課程助理。請分析使用者訊息意圖，並嚴格只回傳 JSON 格式：{"intent":"SHOW_MENU"|"QUERY_COURSE"|"CHAT", "keyword":"分類名稱", "replyText":"親切的對話回覆"}`;
    
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${env.OPENAI_API_KEY}` 
      },
      body: JSON.stringify({
        model: "gpt-4o", // 切換為 4o
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawMessage }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!aiRes.ok) throw new Error(`AI API 報錯: ${aiRes.status}`);

    const data = await aiRes.json();
    const intent = JSON.parse(data.choices[0].message.content);

    if (intent.intent === "SHOW_MENU") {
      const cats = await getCourseCategories(env);
      return await replyToLINE(replyToken, null, generateIntroGigaFlex(cats), env);
    }

    if (intent.intent === "QUERY_COURSE" && intent.keyword) {
      const courses = await getCourseList(intent.keyword, env);
      if (courses.length > 0) return await replyToLINE(replyToken, `為您找到「${intent.keyword}」相關課程：`, generateCourseFlexMessage(courses), env);
      return await replyToLINE(replyToken, `目前找不到「${intent.keyword}」的課程。`, env);
    }

    return await replyToLINE(replyToken, intent.replyText || "您好！有什麼我可以幫您的嗎？您可以輸入 9 查看最新課程。", env);

  } catch (err) {
    console.error("GPT-4o Error:", err);
    // 非 WP 指令發生錯誤時，引導至選單
    return await replyToLINE(replyToken, "助理正在整理思緒，請直接輸入「9」開啟功能選單。", env);
  }
}

async function replyToLINE(replyToken, text, flex, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flex) messages.push(flex);
  if (messages.length === 0) return;

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken: replyToken, messages: messages })
  });
}
