import { sendTelegramMessage } from './telegram_notifier.js';

export async function checkSystemHealth(env) {
  const startTime = Date.now();
  const reports = {
    時間: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
    總體狀態: "正常 (HEALTHY)",
    延遲: "",
    診斷項目: []
  };

  try {
    const gasRes = await fetch(`${env.APPS_SCRIPT_URL}?action=getCourseCategories`);
    const gasData = await gasRes.json();
    const isOk = gasData.status === "success";
    reports.診斷項目.push({ 項目: "資料庫連線", 狀態: isOk ? "通過" : "異常" });
    if (!isOk) reports.總體狀態 = "警告 (DEGRADED)";
  } catch (e) {
    reports.診斷項目.push({ 項目: "資料庫連線", 狀態: "🚨 失敗" });
    reports.總體狀態 = "故障 (CRITICAL)";
  }

  reports.延遲 = (Date.now() - startTime) + "ms";

  if (reports.總體狀態 !== "正常 (HEALTHY)") {
    await sendTelegramMessage(`🚨 系統警報\n狀態：${reports.總體狀態}\n時間：${reports.時間}`, env);
  }

  return new Response(JSON.stringify(reports, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
