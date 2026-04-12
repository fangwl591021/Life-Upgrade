// LIFF 專屬模組 - 徹底分離 UI
export async function handleLiffPayment(orderId, env) {
  const h = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>匯款回報</title><style>body{font-family:sans-serif;margin:0;background:#f4f7f9;font-size:16px}.header{background:#1DB446;color:white;padding:30px;text-align:center;font-weight:semibold;font-size:20px}.container{padding:15px;max-width:500px;margin:auto}.card{background:white;border-radius:20px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:15px}input{width:100%;padding:15px;border:1px solid #e2e8f0;border-radius:12px;box-sizing:border-box;margin-bottom:16px;outline:none;font-size:16px}.btn{background:#007AFF;color:white;padding:18px;border-radius:16px;border:none;width:100%;font-size:18px;font-weight:semibold;cursor:pointer}.label{font-size:12px;font-weight:bold;color:#94a3b8;text-transform:uppercase;margin-bottom:4px}</style></head>',
    '<body><div class="header">回報匯款資訊</div><div class="container"><div id="loading" style="text-align:center;padding:50px;color:#64748b;font-size:18px">正在讀取報名資料...</div><form id="payForm" style="display:none">',
    '<div class="card"><div class="label">預約單號</div><div id="d-oid" style="font-weight:semibold;color:#1e293b;font-size:20px;font-family:monospace"></div><div class="label" style="margin-top:16px">預約課程</div><div id="d-name" style="font-size:18px;color:#475569;font-weight:semibold"></div></div>',
    '<div class="card"><div class="label">報名姓名</div><input type="text" id="name" placeholder="請輸入真實姓名" required><div class="label">聯絡電話</div><input type="tel" id="phone" placeholder="請輸入聯絡電話" required><div class="label">匯款帳號末五碼</div><input type="number" id="last5" placeholder="請輸入匯款後五碼" required></div>',
    '<button type="submit" class="btn" id="subBtn">確認送出回報</button></form></div>',
    '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>',
    '<script>const oid="' + orderId + '", gas="' + env.APPS_SCRIPT_URL + '";',
    'liff.init({liffId:"2009130603-sXSzvlh2"}).then(async()=>{if(!liff.isLoggedIn()){liff.login();return}const uid=liff.getDecodedIDToken().sub;',
    'try{const oR = await fetch(gas + "?action=getUserOrders&lineUid=" + uid).then(r => r.json()); const o = oR.data.find(x => x.orderId === oid); if(!o){document.getElementById("loading").innerText="⚠️ 預約單號不存在"; return} document.getElementById("d-oid").innerText=o.orderId; document.getElementById("d-name").innerText=o.courseName; if(o.status==="已回報匯款"||o.status==="已確認"){alert("此單已回報完成"); liff.closeWindow(); return} document.getElementById("loading").style.display="none"; document.getElementById("payForm").style.display="block";}',
    'catch(e){document.getElementById("loading").innerText="載入失敗。";}});',
    'document.getElementById("payForm").onsubmit=async(e)=>{e.preventDefault(); document.getElementById("subBtn").disabled=true; document.getElementById("subBtn").innerText="傳送中...";',
    'const res = await fetch(gas, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reportPayment", data: { orderId: oid, name: document.getElementById("name").value, phone: document.getElementById("phone").value, last5: document.getElementById("last5").value } }) });',
    'const r = await res.json(); if(r.status==="success"){alert("回報成功！我們會儘速審核。"); liff.closeWindow();}else{alert("失敗："+r.message); document.getElementById("subBtn").disabled=false;}};</script></body></html>'
  ].join("\n");
  return new Response(h, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

export async function handleLiffDescription(cid, env) {
  const h = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:sans-serif;margin:0;background:#fff;font-size:16px}img{width:100%;height:auto;background:#f8fafc;display:block}.content{padding:24px}.price{color:#ef4444;font-weight:semibold;font-size:26px;margin:12px 0}.desc{line-height:1.8;white-space:pre-wrap;font-size:16px;color:#334155}.btn-box{position:fixed;bottom:0;width:100%;padding:20px;background:rgba(255,255,255,0.9);backdrop-filter:blur(8px);border-top:1px solid #f1f5f9;box-sizing:border-box}.btn{background:#007AFF;color:#fff;padding:16px;border-radius:14px;width:100%;font-weight:bold;font-size:18px;border:none;cursor:pointer}</style></head>',
    '<body><div id="loading" style="padding:100px;text-align:center;color:#64748b">正在載入詳情...</div><div id="app" style="display:none"><img id="c-img"><div class="content"><h1 id="c-name" style="font-size:24px;font-weight:bold;color:#1e293b;margin:0"></h1><div class="price" id="c-price"></div><div id="c-desc" class="desc"></div></div><div style="height:100px"></div></div><div class="btn-box" id="btn-c" style="display:none"><button class="btn" onclick="liff.closeWindow()">關閉詳情</button></div>',
    '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>',
    '<script>liff.init({ liffId: "2009130603-sXSzvlh2" }).then(() => {fetch("' + env.APPS_SCRIPT_URL + '?action=getCourseList").then(r=>r.json()).then(res=>{const c=res.data.find(x=>x.id==="' + cid + '");if(c){document.getElementById("c-img").src=c.imageUrl;document.getElementById("c-name").innerText=c.name;document.getElementById("c-price").innerText="NT $"+c.price+" 起";document.getElementById("c-desc").innerText=c.description;document.getElementById("loading").style.display="none";document.getElementById("app").style.display="block";document.getElementById("btn-c").style.display="block";}});});</script></body></html>'
  ].join("\n");
  return new Response(h, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
