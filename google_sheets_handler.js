export async function getCourseCategories(env) {
  try { const res = await fetch(env.APPS_SCRIPT_URL + '?action=getCourseCategories'); const json = await res.json(); return json.data || []; } catch (e) { return []; }
}
export async function getCourseList(category, env) {
  try { const url = env.APPS_SCRIPT_URL + '?action=getCourseList&category=' + encodeURIComponent(category); const res = await fetch(url); const json = await res.json(); return json.data || []; } catch (e) { return []; }
}
export async function getUserOrders(lineUid, env) {
  try { const url = env.APPS_SCRIPT_URL + '?action=getUserOrders&lineUid=' + lineUid; const res = await fetch(url); const json = await res.json(); return json.data || []; } catch (e) { return []; }
}
export async function getUserProfile(lineUid, env) {
  try { const url = env.APPS_SCRIPT_URL + '?action=getUserProfile&lineUid=' + lineUid; const res = await fetch(url); const json = await res.json(); return json.data || null; } catch (e) { return null; }
}
export async function createOrder(lineUid, courseId, amount, env) {
  try { await fetch(env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'createOrder', data: { lineUid, courseId, amount } })}); } catch (e) {}
}
