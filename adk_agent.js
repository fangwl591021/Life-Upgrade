/**
 * 人生進化 Action - 核心大腦 (adk_agent.js)
 * 修正：強化錯誤捕捉，確保「非 WP 指令」時 100% 回應
 */
import { getCourseCategories, getCourseList } from './google_sheets_handler.js';
import { generateIntroGigaFlex, generateCourseFlexMessage } from './message_templates.js';

// WP 專屬關鍵字：AI 遇到這些字眼會保持沉默
const WP_EXCLUSIVE_COMMANDS = ["會員專區", "登入", "註冊", "綁定", "我的帳號", "測試"];

export async function handleAIRequest(event, env) {
  const rawMessage = (event.message.text || "").trim();
  const cleanMsg = rawMessage.replace(/[\s\u3000]/g, "");
  const replyToken = event.replyToken;

  // 1. 【路由過濾層】WP 指令攔截
  if (WP_EXCLUSIVE_COMMANDS.some(cmd => cleanMsg.includes(cmd))) {
    return; // 讓 WP 處理，AI 不回話
  }

  // 2. 【物理隔離層】系統級指令 (不進 AI)
  if (cleanMsg === "檢測") {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
      });
      const aiStatus = res.ok ? "🟢 Gemini 正常" : `🔴 Gemini 異常 (${res.status})`;
      const cats = await getCourseCategories(env);
      const gasStatus = (cats && cats.length > 0) ? `🟢 GAS 正常 (${cats.length}筆)` : "🔴 GAS 無資料";
      return await replyToLINE(replyToken, `【系統診斷報告】\nAI大腦：${aiStatus}\n資料庫：${gasStatus}`, null, env);
    } catch (e) {
      return await replyToLINE(replyToken, `❌ 診斷失敗：${e.message}`, null, env);
    }
  }

  if (cleanMsg === "9" || cleanMsg === "選單") {
    const cats = await getCourseCategories(env);
    if (!cats || cats.length === 0) return await replyToLINE(replyToken, "⚠️ 無法讀取課程分類，請確認試算表 M 欄。", null, env);
    return await replyToLINE(replyToken, null, generateIntroGigaFlex(cats), env);
  }

  // 3. 【AI 語義解析層】
  try {
    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ 
            text: `你是一個專業課程助理。請分析意圖並回傳 JSON: {"intent":"SHOW_MENU"|"QUERY_COURSE"|"CHAT", "keyword":"", "replyText":""}\n使用者說：${rawMessage}` 
          }] 
        }]
      })
    });

    if (!aiRes.ok) {
      const err = await aiRes.json();
      throw new Error(`AI API 報錯: ${aiRes.status} ${err.error?.message || ""}`);
    }

    const data = await aiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    let intent;
    try {
      intent = JSON.parse(cleanJson);
    } catch (e) {
      return await replyToLINE(replyToken, data.candidates?.[0]?.content?.parts?.[0]?.text || "我不太明白您的意思，請輸入 9 查看選單。", null, env);
    }

    if (intent.intent === "SHOW_MENU") {
      const cats = await getCourseCategories(env);
      return await replyToLINE(replyToken, null, generateIntroGigaFlex(cats), env);
    }

    if (intent.intent === "QUERY_COURSE" && intent.keyword) {
      const courses = await getCourseList(intent.keyword, env);
      if (courses.length > 0) return await replyToLINE(replyToken, `為您找到「${intent.keyword}」相關課程：`, generateCourseFlexMessage(courses), env);
      return await replyToLINE(replyToken, `目前找不到「${intent.keyword}」的課程。`, null, env);
    }

    return await replyToLINE(replyToken, intent.replyText || "您好！有什麼我可以幫您的嗎？您可以輸入 9 查看最新課程。", null, env);

  } catch (err) {
    // 【關鍵修正】非 WP 指令發生錯誤時，必須回覆原因，不能沈默
    console.error("Agent Error:", err);
    return await replyToLINE(replyToken, `助理大腦連線異常：${err.message}\n請輸入「9」直接開啟功能選單。`, null, env);
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
    body: JSON.stringify({ replyToken, messages })
  });
}
