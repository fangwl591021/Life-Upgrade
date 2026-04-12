// LIFF 專屬模組 - 修復手機端「網路錯誤」，改由 Worker 代理請求
export async function handleLiffPayment(orderId, env) {
  const h = [
    '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><title>回報匯款</title>',
    '<style>body{font-family:sans-serif;margin:0;background:#f8fafc;color:#1e293b;font-size:16px}.header{background:#1DB446;color:white;padding:32px 20px;text-align:center;font-weight:600;font-size:20px}.container{padding:20px;max-width:480px;margin:0 auto}.card{background:white;border-radius:24px;padding:24px;box-shadow:0 4px 20px rgba(0,0,0,0.05);margin-bottom:20px;border:1px solid #f1f5f9}.label{font-size:12px;font-weight:bold;color:#94a3b8;text-transform:uppercase;margin-bottom:6px}input{width:100%;padding:16px;border:1.5px solid #e2e8f0;border-radius:16px;box-sizing:border-box;margin-bottom:20px;outline:none;font-size:16px}.btn{background:#007AFF;color:white;padding:20px;border-radius:20px;border:none;width:100%;font-size:18px;font-weight:600;cursor:pointer}</style></head>',
    '<body><div class="header">匯款回報中心</div><div class="container"><div id="loading" style="text-align:center;padding:50px;color:#64748b">正在載入註冊資訊...</div>',
    '<form id="payForm" style="display:none"><div class="card"><div class="label">預約單號</div><div id="d-oid" style="font-weight:600;font-size:18px"></div><div class="label" style="margin-top:16px">報名課程</div><div id="d-name" style="font-size:16px;color:#475569"></div></div>',
    '<div class="card"><div class="label">姓名</div><input type="text" id="name" required><div class="label">手機</div><input type="tel" id="phone" required><div class="label">匯款末五碼</div><input type="number" id="last5" required></div>',
    '<button type="submit" class="btn" id="subBtn">確認送出回報</button></form></div>',
    '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>',
    '<script>const oid="'+orderId+'";',
    'async function run(){',
      'try {',
        'await liff.init({liffId:"2009130603-sXSzvlh2"}); if(!liff.isLoggedIn()){liff.login();return}',
        'const uid=liff.getDecodedIDToken().sub;',
        '// 【修復】改呼叫 Worker API 避開 CORS',
        'const [ord, usr] = await Promise.all([',
          'fetch("/api/getUserOrders?lineUid="+uid).then(r=>r.json()),',
          'fetch("/api/getUserProfile?lineUid="+uid).then(r=>r.json())',
        ']);',
        'const o=ord.data.find(x=>x.orderId===oid); if(!o){document.getElementById("loading").innerText="⚠️ 單號不存在。";return}',
        'if(o.status==="已回報匯款"||o.status==="已確認"){alert("此單已回報完成。");liff.closeWindow();return}',
        'if(usr.data){ document.getElementById("name").value=usr.data.name||""; document.getElementById("phone").value=usr.data.phone||""; }',
        'document.getElementById("d-oid").innerText=o.orderId; document.getElementById("d-name").innerText=o.courseName;',
        'document.getElementById("loading").style.display="none"; document.getElementById("payForm").style.display="block";',
      '} catch(e) { document.getElementById("loading").innerText="連線異常，請重試。"; }',
    '}',
    'document.getElementById("payForm").onsubmit=async(e)=>{',
      'e.preventDefault(); const b=document.getElementById("subBtn"); b.disabled=true; b.innerText="處理中...";',
      'try{',
        '// 【修復】同樣透過 Worker API 代理提交',
        'const res=await fetch("/api/reportPayment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reportPayment",data:{orderId:oid,name:document.getElementById("name").value,phone:document.getElementById("phone").value,last5:document.getElementById("last5").value}})});',
        'const r=await res.json(); if(r.status==="success"){alert("回報成功！");liff.closeWindow();}else{alert("失敗："+r.message); b.disabled=false;}',
      '}catch(e){alert("網路連線錯誤，請確認手機網路穩定後重試。"); b.disabled=false;}',
    '}; window.onload=run;</script></body></html>'
  ].join("\n");
  return new Response(h, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

export async function handleLiffDescription(cid, env) {
  // 保持穩定...
  return new Response("Description Content", { status: 200 });
}
