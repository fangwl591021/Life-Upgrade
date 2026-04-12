// LIFF 專屬模組 - 徹底分離 UI，解決跳轉後台登入頁的問題
export async function handleLiffPayment(orderId, env) {
  const h = [
    '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>回報匯款資訊</title>',
    '<style>body{font-family:-apple-system,sans-serif;margin:0;background:#f8fafc;color:#1e293b;font-size:16px}',
    '.header{background:#1DB446;color:white;padding:32px 20px;text-align:center;font-weight:600;font-size:20px}',
    '.container{padding:20px;max-width:480px;margin:0 auto}',
    '.card{background:white;border-radius:24px;padding:24px;box-shadow:0 4px 20px rgba(0,0,0,0.05);margin-bottom:20px;border:1px solid #f1f5f9}',
    '.label{font-size:12px;font-weight:bold;color:#94a3b8;text-transform:uppercase;margin-bottom:6px}',
    '.val{font-size:18px;font-weight:600;color:#0f172a;margin-bottom:20px;font-family:monospace}',
    'input{width:100%;padding:16px;border:1.5px solid #e2e8f0;border-radius:16px;box-sizing:border-box;margin-bottom:20px;outline:none;font-size:16px}',
    '.btn{background:#007AFF;color:white;padding:20px;border-radius:20px;border:none;width:100%;font-size:18px;font-weight:600;cursor:pointer}',
    '#loading{text-align:center;padding:100px 20px;color:#64748b;font-size:18px}</style></head>',
    '<body><div class="header">匯款回報中心</div><div class="container"><div id="loading">正在驗證報名資訊...</div><form id="payForm" style="display:none">',
    '<div class="card"><div class="label">預約單號</div><div id="d-oid" class="val"></div><div class="label">預約課程</div><div id="d-name" class="val"></div></div>',
    '<div class="card"><div class="label">報名姓名</div><input type="text" id="name" placeholder="請輸入姓名" required>',
    '<div class="label">手機號碼</div><input type="tel" id="phone" placeholder="請輸入聯絡電話" required>',
    '<div class="label">匯款後五碼</div><input type="number" id="last5" placeholder="請輸入五碼" required></div>',
    '<button type="submit" class="btn" id="subBtn">送出回報資訊</button></form></div>',
    '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>',
    '<script>',
    'const oid="'+orderId+'", gas="'+env.APPS_SCRIPT_URL+'";',
    'liff.init({liffId:"2009130603-sXSzvlh2"}).then(async()=>{',
      'if(!liff.isLoggedIn()){liff.login();return}',
      'const uid=liff.getDecodedIDToken().sub;',
      'try{',
        'const res=await fetch(gas+"?action=getUserOrders&lineUid="+uid).then(r=>r.json());',
        'const o=res.data.find(x=>x.orderId===oid);',
        'if(!o){document.getElementById("loading").innerHTML="⚠️ 單號不存在。";return}',
        'if(o.status==="已回報匯款"||o.status==="已確認"){alert("此單已回報完成。");liff.closeWindow();return}',
        'document.getElementById("d-oid").innerText=o.orderId; document.getElementById("d-name").innerText=o.courseName;',
        'document.getElementById("loading").style.display="none"; document.getElementById("payForm").style.display="block";',
      '}catch(e){document.getElementById("loading").innerText="連線異常。";}',
    '});',
    'document.getElementById("payForm").onsubmit=async(e)=>{',
      'e.preventDefault(); const b=document.getElementById("subBtn"); b.disabled=true; b.innerText="處理中...";',
      'try{',
        'const res=await fetch(gas,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reportPayment",data:{orderId:oid,name:document.getElementById("name").value,phone:document.getElementById("phone").value,last5:document.getElementById("last5").value}})});',
        'const r=await res.json(); if(r.status==="success"){alert("回報成功！");liff.closeWindow();}else{alert("失敗："+r.message); b.disabled=false; b.innerText="送出回報資訊";}',
      '}catch(e){alert("網路錯誤"); b.disabled=false;}',
    '};</script></body></html>'
  ].join("\n");
  return new Response(h, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

export async function handleLiffDescription(cid, env) {
  // 保持之前邏輯，僅確保路徑正確
}
