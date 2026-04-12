import { sendTelegramMessage } from './telegram_notifier.js';

export async function checkSystemHealth(env) {
  const startTime = Date.now();
  const results = {
    timestamp: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
    overall_status: "Healthy",
    webhook_health: "Optimal",
    latency: 0,
    checks: []
  };

  // 1. 偵測 Webhook 核心：GAS 資料庫連線
  try {
    const gasRes = await fetch(env.APPS_SCRIPT_URL + "?action=getCourseCategories", { 
      method: "GET",
      redirect: "follow" 
    });
    const isGasOk = gasRes.ok;
    results.checks.push({
      item: "GAS_Database_API",
      status: isGasOk ? "Pass" : "Fail",
      detail: isGasOk ? "Normal Communication" : `HTTP_${gasRes.status}`
    });
    if (!isGasOk) results.overall_status = "Unhealthy";
  } catch (e) {
    results.checks.push({ item: "GAS_Database_API", status: "Critical", detail: "Connection Timeout" });
    results.overall_status = "Unhealthy";
  }

  // 2. 偵測 Webhook 核心：WordPress Proxy 轉發點
  try {
    const wpRes = await fetch(env.WP_WEBHOOK_URL, { method: "HEAD" });
    const isWpOk = wpRes.status < 500; // 允許 403/401 代表伺服器在線
    results.checks.push({
      item: "WP_Forwarding_Proxy",
      status: isWpOk ? "Pass" : "Down",
      detail: isWpOk ? "Endpoint Reachable" : "WP Server Offline"
    });
    if (!isWpOk) results.webhook_health = "Degraded";
  } catch (e) {
    results.checks.push({ item: "WP_Forwarding_Proxy", status: "Critical", detail: "DNS or URL Error" });
    results.webhook_health = "Degraded";
  }

  // 3. 偵測環境變數配置 (避免 wrangler.toml 漏設定)
  const requiredVars = ["LINE_CHANNEL_ACCESS_TOKEN", "APPS_SCRIPT_URL", "WP_WEBHOOK_URL", "OPENAI_API_KEY"];
  const missingVars = requiredVars.filter(v => !env[v]);
  results.checks.push({
    item: "Environment_Config",
    status: missingVars.length === 0 ? "Pass" : "Warning",
    detail: missingVars.length === 0 ? "All Vars Ready" : `Missing: ${missingVars.join(", ")}`
  });

  results.latency = (Date.now() - startTime) + "ms";

  // 【主動預警】若 Webhook 或 資料庫任一環節出錯，立即發送 TG
  if (results.overall_status !== "Healthy" || results.webhook_health !== "Optimal") {
    const alertMsg = [
      `🚨 <b>人生進化 Action：Webhook 異常警報</b>`,
      `------------------`,
      `🔴 系統狀態：${results.overall_status}`,
      `🟠 Webhook：${results.webhook_health}`,
      `⏰ 時間：${results.timestamp}`,
      `⏱️ 延遲：${results.latency}`,
      `🔍 診斷細節：`,
      results.checks.map(c => `${c.status === "Pass" ? "✅" : "❌"} ${c.item}: ${c.detail}`).join("\n")
    ].join("\n");
    
    await sendTelegramMessage(alertMsg, env);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json;charset=utf-8" }
  });
}
