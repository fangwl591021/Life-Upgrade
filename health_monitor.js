import { sendTelegramMessage } from './telegram_notifier.js';

export async function checkSystemHealth(env) {
  const startTime = Date.now();
  const reports = {
    timestamp: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
    overall_status: "正常 (Healthy)",
    webhook_health: "優良 (Optimal)",
    latency: "",
    checks: []
  };

  // 1. 偵測 GAS 資料庫 (Webhook 核心)
  try {
    const gasStart = Date.now();
    const gasRes = await fetch(`${env.APPS_SCRIPT_URL}?action=getCourseCategories`);
    const gasData = await gasRes.json();
    const gasTime = Date.now() - gasStart;
    const isOk = gasData.status === "success";
    reports.checks.push({
      項目: "GAS 資料庫連線 (Database)",
      狀態: isOk ? "通過 (Pass)" : "失敗 (Fail)",
      說明: isOk ? "資料庫通訊正常，AI 關鍵字功能可用。" : "資料庫無回應，可能影響報名與查詢。",
      延遲: gasTime + "ms"
    });
    if (!isOk) reports.overall_status = "異常 (Unhealthy)";
  } catch (e) {
    reports.checks.push({ 項目: "GAS 資料庫連線", 狀態: "嚴重 (Critical)", 說明: "GAS 伺服器斷線或 ID 錯誤。" });
    reports.overall_status = "故障 (Critical)";
  }

  // 2. 偵測 WP 轉發代理
  try {
    const wpRes = await fetch(env.WP_WEBHOOK_URL, { method: "HEAD" });
    const isOk = wpRes.status < 500;
    reports.checks.push({
      項目: "WP 轉發代理 (Proxy)",
      狀態: isOk ? "通過 (Pass)" : "斷聯 (Offline)",
      說明: isOk ? "WordPress 接收端在線，資料同步正常。" : "WordPress 伺服器異常，Webhook 無法轉發。"
    });
  } catch (e) {
    reports.checks.push({ 項目: "WP 轉發代理", 狀態: "故障", 說明: "WP Webhook 網址無效。" });
  }

  // 3. 偵測環境變數
  const vars = ["LINE_CHANNEL_ACCESS_TOKEN", "APPS_SCRIPT_URL", "WP_WEBHOOK_URL"];
  const missing = vars.filter(v => !env[v]);
  reports.checks.push({
    項目: "系統變數配置 (ENV)",
    狀態: missing.length === 0 ? "通過" : "警告",
    說明: missing.length === 0 ? "所有金鑰配置齊全。" : `遺漏：${missing.join(", ")}`
  });

  reports.latency = (Date.now() - startTime) + "ms";

  // 【主動預警】發生異常即發送 TG
  if (reports.overall_status !== "正常 (Healthy)") {
    const alert = `🚨 <b>人生進化 Action：系統健康警報</b>\n------------------\n狀態：${reports.overall_status}\n時間：${reports.timestamp}\n細節：${reports.latency}\n請立即檢查！`;
    await sendTelegramMessage(alert, env);
  }

  return new Response(JSON.stringify(reports, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
