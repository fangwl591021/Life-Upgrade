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

    // 路由 1：管理後台 UI (嚴格遵循 v1.0 規範)
    if (url.pathname === '/admin') return handleAdminPage(env);

    // 路由 2：後台 API 代理 (修復轉發與認證)
    if (url.pathname.startsWith('/api/admin/')) {
      const u = request.headers.get('X-Admin-User');
      const p = request.headers.get('X-Admin-Pass');
      if (u !== env.ADMIN_USERNAME || p !== env.ADMIN_PASSWORD) return new Response('Unauthorized', { status: 401 });
      const action = url.pathname.replace('/api/admin/', '');
      const gasUrl = env.APPS_SCRIPT_URL + '?action=' + action;
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
        return new Response(await gasRes.text(), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (e) {
        return new Response(JSON.stringify({status:'error', message: e.toString()}), { status: 500, headers: corsHeaders });
      }
    }

    // 路由 3：LIFF 功能 (優先檢查參數，確保回報表單能正確開啟)
    if (request.method === 'GET') {
      const orderId = url.searchParams.get('orderId');
      const id = url.searchParams.get('id');
      if (orderId) return handleLiffPayment(orderId, env);
      if (id) return handleLiffDescription(id, env);
      return handleStatusPage();
    }

    // 路由 4：LINE Webhook 核心分流
    if (request.method === 'POST') {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response('OK');
        for (const event of body.events) {
          if (event.type === 'message' && event.message.type === 'text') {
            const text = event.message.text.trim();
            const aiKeywords = ['預約', '課程', '報名', '紀錄', '查', '訂單', '取消報名'];
            if (aiKeywords.some(k => text.includes(k))) {
              ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
              ctx.waitUntil(handleAIRequest(event, env));
            } else {
              ctx.waitUntil(forwardToWP(bodyText, request.headers, env));
            }
          } else {
            ctx.waitUntil(forwardToWP(bodyText, request.headers, env));
          }
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
  const h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>系統狀態</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-50 flex items-center justify-center min-h-screen font-sans"><div class="max-w-md w-full bg-white p-10 rounded-3xl shadow-xl text-center border border-slate-100"><h1 class="text-2xl font-black text-slate-800 mb-6 tracking-tighter">人生進化 Action</h1><p class="text-slate-500 mb-8 text-sm">服務連線正常。<br>管理員請點擊下方進入管理系統。</p><a href="/admin" class="block w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-100 transition hover:bg-blue-700">進入管理後台</a></div></body></html>';
  return new Response(h, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleAdminPage(env) {
  const h = '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>人生進化 Action Pro 管理後台</title><script src="https://cdn.tailwindcss.com"></script><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.nav-active{background:#eff6ff;color:#2563eb;border-radius:0.75rem;font-weight:600}#loader{background:rgba(255,255,255,0.8);backdrop-filter:blur(4px)}</style></head><body class="bg-slate-50 text-slate-800 min-h-screen flex"><div id="login-screen" class="fixed inset-0 bg-slate-50 flex items-center justify-center z-50"><div class="w-full max-w-sm bg-white p-10 rounded-2xl shadow-xl border border-slate-100 text-center"><h1 class="text-2xl font-black mb-1">人生進化 Action</h1><p class="text-slate-400 text-sm mb-8">管理員權限認證</p><div class="space-y-4"><input type="text" id="admin-user" class="w-full border border-slate-200 p-4 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="帳號"><input type="password" id="admin-pw" class="w-full border border-slate-200 p-4 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="密碼"><button onclick="doLogin()" id="lbtn" class="w-full bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-blue-100">登入系統</button></div><div id="diag" class="hidden mt-6 p-4 bg-red-50 text-red-700 text-[10px] text-left rounded-lg font-mono overflow-auto max-h-40"></div></div></div><aside class="w-64 bg-white border-r border-slate-200 flex-none hidden md:flex flex-col"><div class="p-6 border-b border-slate-100"><h1 class="text-xl font-bold text-slate-800 tracking-tighter">人生進化 Action</h1></div><nav class="flex-1 p-4 space-y-2"><button onclick="st(\'dashboard\')" id="n-dashboard" class="flex items-center w-full p-3 text-slate-500 hover:text-blue-600 transition">📊 營運統計</button><button onclick="st(\'courses\')" id="n-courses" class="flex items-center w-full p-3 text-slate-500 hover:text-blue-600 transition">📖 課程管理</button><button onclick="st(\'orders\')" id="n-orders" class="flex items-center w-full p-3 text-slate-500 hover:text-blue-600 transition">📜 訂單管理</button><button onclick="st(\'users\')" id="n-users" class="flex items-center w-full p-3 text-slate-500 hover:text-blue-600 transition">👥 會員管理</button></nav><div class="p-4 border-t border-slate-100"><button onclick="location.reload()" class="text-xs text-slate-400 font-bold hover:text-red-500 uppercase px-3 transition">Logout</button></div></aside><main class="flex-1 flex flex-col min-w-0 overflow-hidden"><header class="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8"><div id="path-display" class="text-sm text-slate-500 font-medium">目前路徑：首頁 / 營運統計</div><div class="flex items-center space-x-3"><span class="text-sm font-semibold text-slate-700">管理員</span><div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">A</div></div></header><section class="p-8 overflow-y-auto" id="main-section"></section></main><div id="loader" class="hidden fixed inset-0 flex items-center justify-center z-40"><div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div></div><script>const State={data:null,tab:\'dashboard\',u:\'\',p:\'\'};async function doLogin(){const user=document.getElementById(\'admin-user\').value,pass=document.getElementById(\'admin-pw\').value;const b=document.getElementById(\'lbtn\'),d=document.getElementById(\'diag\');b.innerText="正在驗證...";d.classList.add(\'hidden\');try{const r=await fetch(\'/api/admin/adminGetData\',{headers:{\'X-Admin-User\':user,\'X-Admin-Pass\':pass}});const t=await r.text();try{const j=JSON.parse(t);if(r.ok&&j.status===\'success\'){State.data=j.data;State.u=user;State.p=pass;document.getElementById(\'login-screen\').classList.add(\'hidden\');st(\'dashboard\')}else{alert(\'帳號或密碼錯誤\')}}catch(e){d.classList.remove(\'hidden\');d.innerText="🚨系統錯誤：收到了網頁內容而不是資料。請確認 GAS 權限設為「所有人」。\\n首 200 字："+t.substring(0,200)}}catch(e){alert(\'連線失敗\')}finally{b.innerText="登入系統"}}function st(t){State.tab=t;document.querySelectorAll(\'nav button\').forEach(b=>b.className="flex items-center w-full p-3 text-slate-500 hover:text-blue-600 transition");const ab=document.getElementById(\'n-\'+t);if(ab)ab.className="flex items-center w-full p-3 nav-active";render()}function render(){const s=document.getElementById(\'main-section\');const p=document.getElementById(\'path-display\');const d=State.data;if(State.tab===\'dashboard\'){p.innerText="目前路徑：首頁 / 營運統計";const pend=d.orders.filter(o=>o.status===\'待匯款\').length;const inc=d.orders.filter(o=>o.status===\'已確認\').reduce((sum,o)=>sum+(parseInt(o.amount)||0),0);s.innerHTML=\'<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"><div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div class="text-slate-500 text-xs font-semibold mb-2 uppercase">待收金額 (待付款)</div><div class="text-3xl font-black text-orange-500">$\'+(d.orders.filter(o=>o.status===\'待匯款\').reduce((sm,o)=>sm+(parseInt(o.amount)||0),0)).toLocaleString()+\'</div></div><div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div class="text-slate-500 text-xs font-semibold mb-2 uppercase">總實收金額 (已完款)</div><div class="text-3xl font-black text-emerald-600">$\'+inc.toLocaleString()+\'</div></div><div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div class="text-slate-500 text-xs font-semibold mb-2 uppercase">系統總會員數</div><div class="text-3xl font-black text-blue-600">\'+d.users.length+\' 人</div></div></div><div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-100"><h2 class="font-bold text-lg mb-4 text-slate-800 border-l-4 border-blue-600 pl-4">系統服務狀態</h2><div class="flex items-center text-emerald-500 text-sm font-medium"><span class="w-2 h-2 bg-emerald-500 rounded-full mr-3 animate-pulse"></span>已成功與 Google Sheets 資料同步</div></div>\'}else if(State.tab===\'orders\'){p.innerText="目前路徑：首頁 / 訂單管理";let rows=d.orders.map(o=>\'<tr class="hover:bg-slate-50/80 transition border-b border-slate-50"><td class="p-4 font-mono text-[11px] text-slate-400">\'+o.orderId+\'</td><td class="p-4 font-bold text-slate-700">\'+(o.name||\'訪客\')+\'</td><td class="p-4 text-xs text-slate-500">\'+o.courseName+\'</td><td class="p-4 font-bold text-blue-600">$\'+o.amount+\'</td><td class="p-4"><span class="px-3 py-1 rounded-lg text-[10px] font-bold \'+(o.status===\'已確認\'?\'bg-emerald-50 text-emerald-600\':o.status===\'待匯款\'?\'bg-orange-50 text-orange-600\':\'bg-slate-100 text-slate-400\')+\'">\'+o.status+\'</span></td><td class="p-4 font-mono text-xs text-blue-500">\'+(o.last5||\'-\')+\'</td><td class="p-4 text-right"><button onclick="uo(\\\'\'+o.orderId+\'\\\',\\\'已確認\\\')" class="text-blue-600 font-bold text-xs uppercase hover:underline">確認</button></td></tr>\').join(\'\');s.innerHTML=\'<div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider"><tr><th class="p-4">單號</th><th class="p-4">學員</th><th class="p-4">報名課程</th><th class="p-4">金額</th><th class="p-4">狀態</th><th class="p-4">後五碼</th><th class="p-4 text-right">操作</th></tr></thead><tbody>\'+rows+\'</tbody></table></div></div>\'}else if(State.tab===\'courses\'){p.innerText="目前路徑：首頁 / 課程管理";let cards=d.courses.map(c=>\'<div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 transition hover:border-blue-200"><div class="flex justify-between items-start mb-6"><div><div class="font-bold text-slate-800">\'+c.name+\'</div><div class="text-[10px] font-mono text-slate-300 uppercase tracking-tighter">\'+c.id+\'</div></div></div><div class="space-y-4"><div><label class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">階段類別</label><input id="c-\'+c.id+\'" value="\'+c.category+\'" class="w-full border-b border-slate-100 py-2 text-sm outline-none focus:border-blue-500 transition"></div><div><label class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">課程費用</label><input id="p-\'+c.id+\'" type="number" value="\'+c.price+\'" class="w-full border-b border-slate-100 py-2 text-xl font-black text-blue-600 outline-none transition"></div><button onclick="sc(\\\'\'+c.id+\'\\\')" class="w-full bg-slate-900 text-white py-3 rounded-xl text-xs font-bold hover:bg-black transition shadow-lg shadow-slate-100 uppercase">儲存變更</button></div></div>\').join(\'\');s.innerHTML=\'<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">\'+cards+\'</div>\'}else if(State.tab===\'users\'){p.innerText="目前路徑：首頁 / 會員管理";let uRows=d.users.map(u=>\'<tr class="hover:bg-slate-50 transition border-b border-slate-50"><td class="p-4 font-mono text-[10px] text-slate-400">\'+u.uid+\'</td><td class="p-4 font-bold text-slate-800">\'+u.name+\'</td><td class="p-4 font-mono text-xs text-slate-500">\'+u.phone+\'</td><td class="p-4 text-[10px] text-slate-400 font-bold uppercase">\'+u.time+\'</td><td class="p-4 text-right"><button class="text-blue-600 font-bold text-xs">詳情</button></td></tr>\').join(\'\');s.innerHTML=\'<div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"><table class="w-full text-left"><thead><tr class="bg-slate-50 text-[10px] text-slate-500 font-bold uppercase tracking-wider"><th class="p-4">姓名</th><th class="p-4">手機</th><th class="p-4">身分證</th><th class="p-4">註冊時間</th><th class="p-4 text-right">操作</th></tr></thead><tbody>\'+uRows+\'</tbody></table></div>\'}}async function uo(id,st){if(!confirm(\'確認更新訂單狀態？\'))return;tl(true);try{const r=await fetch(\'/api/admin/adminUpdateOrder\',{method:\'POST\',headers:{\'X-Admin-User\':State.u,\'X-Admin-Pass\':State.p,\'Content-Type\':\'application/json\'},body:JSON.stringify({action:\'adminUpdateOrder\',data:{orderId:id,status:st}})});if(r.ok)await rf()}finally{tl(false)}}async function sc(id){const price=document.getElementById(\'p-\'+id).value,cat=document.getElementById(\'c-\'+id).value;tl(true);try{const r=await fetch(\'/api/admin/adminUpdateCourse\',{method:\'POST\',headers:{\'X-Admin-User\':State.u,\'X-Admin-Pass\':State.p,\'Content-Type\':\'application/json\'},body:JSON.stringify({action:\'adminUpdateCourse\',data:{id:id,price:price,category:cat}})});if(r.ok){alert(\'設定更新成功\');await rf()}}finally{tl(false)}}async function rf(){const r=await fetch(\'/api/admin/adminGetData\',{headers:{\'X-Admin-User\':State.u,\'X-Admin-Pass\':State.p}});const j=await r.json();State.data=j.data;render()}function tl(v){const l=document.getElementById(\'loader\');if(v)l.classList.remove(\'hidden\');else l.classList.add(\'hidden\')}</script></body></html>';
  return new Response(h, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffPayment(orderId, env) {
  const h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>匯款回報</title><style>body{font-family:sans-serif;margin:0;background:#f4f7f9}.header{background:#1DB446;color:white;padding:25px;text-align:center;font-weight:bold}.container{padding:15px;max-width:500px;margin:auto}.card{background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:15px}input{width:100%;padding:12px;border:1px solid #e0e0e0;border-radius:8px;box-sizing:border-box;margin-bottom:15px}.btn{background:#007AFF;color:white;padding:16px;border-radius:12px;border:none;width:100%;font-size:17px;font-weight:bold;cursor:pointer}</style></head><body><div class="header">回報匯款資訊</div><div class="container"><div id="loading" style="text-align:center;padding:50px">正在讀取預約資料...</div><form id="payForm" style="display:none"><div class="card"><div id="d-oid" style="font-weight:bold;color:#333"></div><div id="d-name" style="font-size:13px;color:#666;margin-top:4px"></div></div><div class="card"><input type="text" id="name" placeholder="報名姓名" required><input type="tel" id="phone" placeholder="聯絡電話" required><input type="number" id="last5" placeholder="匯款帳號末五碼" required></div><button type="submit" class="btn" id="subBtn">確認送出回報</button></form></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>const oid="' + orderId + '", gas="' + env.APPS_SCRIPT_URL + '";liff.init({liffId:"2009130603-ktCTGk6d"}).then(async()=>{if(!liff.isLoggedIn()){liff.login();return}const uid=liff.getDecodedIDToken().sub;try{const oR=await fetch(gas+"?action=getUserOrders&lineUid="+uid).then(r=>r.json());const o=oR.data.find(x=>x.orderId===oid);if(!o){document.getElementById(\'loading\').innerText=\'此單號不存在或已被取消\';return}document.getElementById(\'d-oid\').innerText="預約單號: "+o.orderId;document.getElementById(\'d-name\').innerText="預約課程: "+o.courseName;if(o.status==="已回報匯款"||o.status==="已確認"){alert("此單已回報完成，請等候核對。");liff.closeWindow();return}document.getElementById(\'loading\').style.display=\'none\';document.getElementById(\'payForm\').style.display=\'block\'}catch(e){alert("資料載入異常，請稍後再試。")}});document.getElementById(\'payForm\').onsubmit=async(e)=>{e.preventDefault();document.getElementById(\'subBtn\').disabled=true;const res=await fetch(gas,{method:\'POST\',body:JSON.stringify({action:\'reportPayment\',data:{orderId:oid,name:document.getElementById(\'name\').value,phone:document.getElementById(\'phone\').value,last5:document.getElementById(\'last5\').value,courseName:document.getElementById(\'d-name\').innerText}})});const r=await res.json();if(r.status===\'success\'){alert(\'回報成功！我們會儘速審核訂單。\');liff.closeWindow()}else{alert(\'提交失敗：\'+r.message);document.getElementById(\'subBtn\').disabled=false}};</script></body></html>';
  return new Response(h, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffDescription(cid, env) {
  const h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:sans-serif;margin:0;background:#fff}img{width:100%;height:auto;background:#eee}.content{padding:20px}.price{color:#f00;font-weight:bold;font-size:22px}.desc{line-height:1.7;white-space:pre-wrap;font-size:18px}.btn-box{position:fixed;bottom:0;width:100%;padding:15px;background:#fff;border-top:1px solid #eee}.btn{background:#007AFF;color:#fff;padding:14px;border-radius:10px;width:100%;font-weight:bold;font-size:18px;border:none;cursor:pointer}</style></head><body><div id="loading" style="padding:100px;text-align:center">課程詳情讀取中...</div><div id="app" style="display:none"><img id="c-img"><div class="content"><h1 id="c-name"></h1><div class="price" id="c-price"></div><div id="c-desc" class="desc"></div></div></div><div class="btn-box" id="btn-c" style="display:none"><button class="btn" onclick="liff.closeWindow()">關閉</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>liff.init({ liffId: "2009130603-ktCTGk6d" }).then(() => { fetch("' + env.APPS_SCRIPT_URL + '?action=getCourseList").then(r=>r.json()).then(res=>{ const c=res.data.find(x=>x.id==="' + cid + '"); if(c){ document.getElementById(\'c-img\').src=c.imageUrl; document.getElementById(\'c-name\').innerText=c.name; document.getElementById(\'c-price\').innerText="NT $"+c.price+" 起"; document.getElementById(\'c-desc\').innerText=c.description; document.getElementById(\'loading\').style.display=\'none\'; document.getElementById(\'app\').style.display=\'block\'; document.getElementById(\'btn-c\').style.display=\'block\' } }) })</script></body></html>';
  return new Response(h, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
