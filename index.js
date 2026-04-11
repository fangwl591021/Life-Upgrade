import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-User, X-Admin-Pass'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // 管理後台頁面
    if (url.pathname === '/admin') return handleAdminPage(env);

    // API 代理邏輯 (移除反引號以防 Build Failed)
    if (url.pathname.startsWith('/api/admin/')) {
      const user = request.headers.get('X-Admin-User');
      const pass = request.headers.get('X-Admin-Pass');
      if (user !== env.ADMIN_USERNAME || pass !== env.ADMIN_PASSWORD) return new Response('Unauthorized', { status: 401 });
      
      const gasUrl = env.APPS_SCRIPT_URL + '?action=' + url.pathname.replace('/api/admin/', '');
      try {
        const fetchOptions = {
          method: request.method,
          redirect: 'follow',
          headers: { 'Accept': 'application/json' }
        };
        if (request.method === 'POST') {
          fetchOptions.body = await request.text();
          fetchOptions.headers['Content-Type'] = 'text/plain;charset=utf-8';
        }
        const gasRes = await fetch(gasUrl, fetchOptions);
        const text = await gasRes.text();
        return new Response(text, { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (e) {
        return new Response(JSON.stringify({status:'error', message: e.toString()}), { status: 500, headers: corsHeaders });
      }
    }

    // LIFF 功能處理
    if (request.method === 'GET') {
      if (url.searchParams.has('orderId')) return handleLiffPayment(url, env);
      if (url.searchParams.has('id')) return handleLiffDescription(url, env);
      return handleStatusPage();
    }

    // Webhook 處理
    if (request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.events || body.events.length === 0) return new Response('OK');
        for (const event of body.events) {
          if (event.type === 'message' && event.message.type === 'text') {
            const text = event.message.text.trim();
            const aiKeywords = ['預約', '課程', '報名', '紀錄', '查', '訂單', '取消報名'];
            if (aiKeywords.some(k => text.includes(k))) {
              ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
              ctx.waitUntil(handleAIRequest(event, env));
            } else { ctx.waitUntil(forwardToWP(request.clone(), env)); }
          } else { ctx.waitUntil(forwardToWP(request.clone(), env)); }
        }
        return new Response('OK');
      } catch (e) { return new Response('OK'); }
    }
    return new Response('Running', { status: 200 });
  }
};

async function triggerLoadingAnimation(userId, env) {
  try {
    await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN },
      body: JSON.stringify({ chatId: userId, loadingSeconds: 5 })
    });
  } catch (e) {}
}

function handleStatusPage() {
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>System Status</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-50 flex items-center justify-center min-h-screen font-sans text-center px-4"><div class="max-w-md w-full bg-white p-10 rounded-3xl shadow-xl"><h1 class="text-2xl font-black text-slate-900 mb-6">人生進化 Action</h1><a href="/admin" class="block w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-100">進入管理後台</a></div></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleAdminPage(env) {
  const html = '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>Sportsland Pro Admin</title><script src="https://cdn.tailwindcss.com"></script><style>body{font-family:sans-serif;background:#f8fafc}.nav-active{color:#2563eb;border-bottom:2px solid #2563eb;font-weight:600}</style></head><body><div id="login-box" class="fixed inset-0 bg-slate-50 flex items-center justify-center z-50"><div class="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl"><h1 class="text-2xl font-black text-center mb-6">管理系統認證</h1><div class="space-y-4"><input type="text" id="admin-user" class="w-full border p-3 rounded-xl outline-none" placeholder="Username"><input type="password" id="admin-pw" class="w-full border p-3 rounded-xl outline-none" placeholder="Password"><button onclick="doLogin()" id="lbtn" class="w-full bg-blue-600 text-white p-4 rounded-xl font-bold transition">登入系統</button></div><div id="diag" class="hidden mt-4 p-3 bg-red-50 text-red-600 text-[10px] rounded font-mono overflow-auto max-h-40 border border-red-100"></div></div></div><div id="app-screen" class="hidden"><header class="bg-white border-b sticky top-0 px-4 h-16 flex items-center justify-between z-10"><span class="font-bold text-blue-600">Sportsland Pro</span><nav class="flex space-x-6"><button onclick="st(\'dashboard\')" id="n-dashboard" class="nav-active text-sm py-5">數據看板</button><button onclick="st(\'orders\')" id="n-orders" class="text-slate-500 text-sm py-5">訂單管理</button><button onclick="st(\'courses\')" id="n-courses" class="text-slate-500 text-sm py-5">課程維護</button><button onclick="st(\'users\')" id="n-users" class="text-slate-500 text-sm py-5">學員名單</button></nav><button onclick="location.reload()" class="text-xs text-slate-400 font-bold">登出</button></header><main class="max-w-7xl mx-auto p-6" id="cnt"></main></div><script>let u="",p="",sd=null;async function doLogin(){u=document.getElementById(\'admin-user\').value;p=document.getElementById(\'admin-pw\').value;const b=document.getElementById(\'lbtn\'),d=document.getElementById(\'diag\');b.innerText="驗證中...";d.classList.add(\'hidden\');try{const r=await fetch(\'/api/admin/adminGetData\',{headers:{\'X-Admin-User\':u,\'X-Admin-Pass\':p}});const t=await r.text();try{const j=JSON.parse(t);if(r.ok&&j.status===\'success\'){sd=j;document.getElementById(\'login-box\').classList.add(\'hidden\');document.getElementById(\'app-screen\').classList.remove(\'hidden\');st(\'dashboard\')}else{alert(\'認證失敗\')}}catch(e){d.classList.remove(\'hidden\');d.innerText="🚨 除錯：收到 HTML 內容。請檢查 GAS 權限是否設為所有人(Anyone)。\\n內容首 200 字："+t.substring(0,200)}}catch(e){alert(\'網路錯誤\')}finally{b.innerText="登入系統"}}function st(tab){document.querySelectorAll(\'nav button\').forEach(b=>b.className="text-slate-500 text-sm py-5");const ab=document.getElementById(\'n-\'+tab);if(ab)ab.className="nav-active text-sm py-5";const d=sd.data;if(tab===\'dashboard\'){const pend=d.orders.filter(o=>o.status===\'待匯款\').length,inc=d.orders.filter(o=>o.status===\'已確認\').reduce((s,o)=>s+(parseInt(o.amount)||0),0);document.getElementById(\'cnt\').innerHTML=\'<div class="grid grid-cols-1 md:grid-cols-3 gap-6"><div class="bg-white p-6 rounded-2xl shadow-sm"><div class="text-slate-400 text-xs font-bold mb-2 uppercase">待處理訂單</div><div class="text-3xl font-black text-orange-500">\'+pend+\' 筆</div></div><div class="bg-white p-6 rounded-2xl shadow-sm"><div class="text-slate-400 text-xs font-bold mb-2 uppercase">累計課程收入</div><div class="text-3xl font-black text-emerald-600">$\'+inc.toLocaleString()+\'</div></div><div class="bg-white p-6 rounded-2xl shadow-sm"><div class="text-slate-400 text-xs font-bold mb-2 uppercase">總註冊學員</div><div class="text-3xl font-black text-blue-600">\'+d.users.length+\' 位</div></div></div>\'}if(tab===\'orders\'){let rs=d.orders.map(o=>\'<tr class="hover:bg-slate-50 border-b border-slate-50"><td class="py-4 px-4 text-[10px] font-mono text-slate-400">\'+o.orderId+\'</td><td class="py-4 px-4 font-bold text-sm">\'+(o.name||\'-\')+\'</td><td class="py-4 px-4 text-xs">\'+o.courseName+\'</td><td class="py-4 px-4 font-black text-blue-600 text-sm">$\'+o.amount+\'</td><td class="py-4 px-4 text-[10px] font-bold">\'+o.status+\'</td><td class="py-4 px-4 font-mono text-xs text-blue-500 font-bold">\'+(o.last5||\'-\')+\'</td><td class="py-4 px-4 text-right"><button onclick="uo(\\\'\'+o.orderId+\'\\\',\\\'已確認\\\')" class="text-blue-600 font-black text-[10px] uppercase">確認</button></td></tr>\').join(\'\');document.getElementById(\'cnt\').innerHTML=\'<div class="bg-white rounded-2xl shadow-sm overflow-hidden"><table class="w-full text-left"><thead><tr class="bg-slate-50 text-slate-400 text-[9px] font-black uppercase"><th class="p-4">ID</th><th class="p-4">NAME</th><th class="p-4">COURSE</th><th class="p-4">PRICE</th><th class="p-4">STATUS</th><th class="p-4">BANK</th><th class="p-4 text-right">ACTION</th></tr></thead><tbody>\'+rs+\'</tbody></table></div>\'}if(tab===\'courses\'){let cs=d.courses.map(c=>\'<div class="bg-white p-6 rounded-2xl shadow-sm"><div class="flex justify-between mb-4"><div class="font-bold">\'+c.name+\'</div><div class="text-[9px] text-slate-300">\'+c.id+\'</div></div><div class="space-y-4"><div><label class="text-[9px] font-black text-slate-300">類別</label><input id="c-\'+c.id+\'" value="\'+c.category+\'" class="w-full border-b py-1 text-xs outline-none"></div><div><label class="text-[9px] font-black text-slate-300">預約訂金</label><input id="p-\'+c.id+\'" type="number" value="\'+c.price+\'" class="w-full border-b py-1 text-lg font-black text-blue-600 outline-none"></div><button onclick="sc(\\\'\'+c.id+\'\\\')" class="w-full bg-slate-900 text-white py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-slate-100">更新設定</button></div></div>\').join(\'\');document.getElementById(\'cnt\').innerHTML=\'<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">\'+cs+\'</div>\'}if(tab===\'users\'){let us=d.users.map(u=>\'<tr class="border-b hover:bg-slate-50 transition"><td class="p-4 text-[10px] font-mono text-slate-400">\'+u.uid+\'</td><td class="p-4 font-bold text-sm">\'+u.name+\'</td><td class="p-4 text-xs font-mono text-slate-500">\'+u.phone+\'</td><td class="p-4 text-[10px] text-slate-400 font-bold">\'+u.time+\'</td></tr>\').join(\'\');document.getElementById(\'cnt\').innerHTML=\'<div class="bg-white rounded-2xl shadow-sm overflow-hidden"><table class="w-full text-left"><thead><tr class="bg-slate-50 text-slate-400 text-[9px] font-black uppercase"><th>UID</th><th>NAME</th><th>PHONE</th><th>JOIN DATE</th></tr></thead><tbody>\'+us+\'</tbody></table></div>\'}}async function uo(id,s){if(!confirm(\'確認變更？\'))return;const r=await fetch(\'/api/admin/adminUpdateOrder\',{method:\'POST\',headers:{\'X-Admin-User\':u,\'X-Admin-Pass\':p,\'Content-Type\':\'application/json\'},body:JSON.stringify({action:\'adminUpdateOrder\',data:{orderId:id,status:s}})});if(r.ok)rf()}async function sc(id){const p1=document.getElementById(\'p-\'+id).value,c1=document.getElementById(\'c-\'+id).value;const r=await fetch(\'/api/admin/adminUpdateCourse\',{method:\'POST\',headers:{\'X-Admin-User\':u,\'X-Admin-Pass\':p,\'Content-Type\':\'application/json\'},body:JSON.stringify({action:\'adminUpdateCourse\',data:{id:id,price:p1,category:c1}})});if(r.ok){alert(\'成功\');rf()}}async function rf(){const r=await fetch(\'/api/admin/adminGetData\',{headers:{\'X-Admin-User\':u,\'X-Admin-Pass\':p}});const j=await r.json();sd=j;st(document.querySelector(\'.nav-active\').id.replace(\'n-\',\'\'))}</script></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffPayment(url, env) {
  const orderId = url.searchParams.get('orderId');
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>匯款回報</title><style>body{font-family:sans-serif;margin:0;background:#f4f7f9}.header{background:#1DB446;color:white;padding:25px;text-align:center}.container{padding:15px;max-width:500px;margin:auto}.card{background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:15px}input{width:100%;padding:12px;border:1px solid #e0e0e0;border-radius:8px;box-sizing:border-box;margin-bottom:15px}.btn{background:#007AFF;color:white;padding:16px;border-radius:12px;border:none;width:100%;font-size:17px;font-weight:bold}</style></head><body><div class="header">回報匯款資訊</div><div class="container"><div id="loading" style="text-align:center;padding:50px">檢查資料中...</div><form id="payForm" style="display:none"><div class="card"><div id="d-oid"></div><div id="d-name"></div></div><div class="card"><input type="text" id="name" placeholder="姓名" required><input type="tel" id="phone" placeholder="電話" required><input type="number" id="last5" placeholder="帳號末五碼" required></div><button type="submit" class="btn" id="subBtn">送出回報</button></form></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>const oid="' + orderId + '";const gas="' + env.APPS_SCRIPT_URL + '";liff.init({liffId:"2009130603-ktCTGk6d"}).then(async()=>{if(!liff.isLoggedIn()){liff.login();return}const uid=liff.getDecodedIDToken().sub;try{const[oR,pR]=await Promise.all([fetch(gas+"?action=getUserOrders&lineUid="+uid).then(r=>r.json()),fetch(gas+"?action=getUserProfile&lineUid="+uid).then(r=>r.json())]);const o=oR.data.find(x=>x.orderId===oid);if(!o){document.getElementById(\'loading\').innerText=\'單號不存在\';return}document.getElementById(\'d-oid\').innerText="單號: "+o.orderId;document.getElementById(\'d-name\').innerText="課程: "+o.courseName;if(pR.data){document.getElementById(\'name\').value=pR.data.name||"";document.getElementById(\'phone\').value=pR.data.phone||""}document.getElementById(\'loading\').style.display=\'none\';document.getElementById(\'payForm\').style.display=\'block\'}catch(e){alert("資料載入失敗")}});document.getElementById(\'payForm\').onsubmit=async(e)=>{e.preventDefault();document.getElementById(\'subBtn\').disabled=true;const res=await fetch(gas,{method:\'POST\',body:JSON.stringify({action:\'reportPayment\',data:{orderId:oid,name:document.getElementById(\'name\').value,phone:document.getElementById(\'phone\').value,last5:document.getElementById(\'last5\').value,courseName:document.getElementById(\'d-name\').innerText}})});const r=await res.json();if(r.status===\'success\'){alert(\'成功\');liff.closeWindow()}else{alert(\'失敗\');document.getElementById(\'subBtn\').disabled=false}}; </script></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffDescription(url, env) {
  const cid = url.searchParams.get('id');
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:sans-serif;margin:0;background:#fff}img{width:100%;height:auto;background:#eee}.content{padding:20px}.price{color:#f00;font-weight:bold;font-size:22px}.desc{line-height:1.7;white-space:pre-wrap;font-size:18px}.btn-box{position:fixed;bottom:0;width:100%;padding:15px;background:#fff;border-top:1px solid #eee}.btn{background:#007AFF;color:#fff;padding:14px;border-radius:10px;width:100%;font-weight:bold;font-size:18px;border:none}</style></head><body><div id="loading" style="padding:100px;text-align:center">讀取中...</div><div id="app" style="display:none"><img id="c-img"><div class="content"><h1 id="c-name"></h1><div class="price" id="c-price"></div><div id="c-desc" class="desc"></div></div></div><div class="btn-box" id="btn-c" style="display:none"><button class="btn" onclick="liff.closeWindow()">關閉視窗</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>liff.init({ liffId: "2009130603-ktCTGk6d" }).then(() => { fetch("' + env.APPS_SCRIPT_URL + '?action=getCourseList").then(r=>r.json()).then(res=>{ const c=res.data.find(x=>x.id==="' + cid + '"); if(c){ document.getElementById(\'c-img\').src=c.imageUrl; document.getElementById(\'c-name\').innerText=c.name; document.getElementById(\'c-price\').innerText="NT $"+c.price+" 起"; document.getElementById(\'c-desc\').innerText=c.description; document.getElementById(\'loading\').style.display=\'none\'; document.getElementById(\'app\').style.display=\'block\'; document.getElementById(\'btn-c\').style.display=\'block\' } }) })</script></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
