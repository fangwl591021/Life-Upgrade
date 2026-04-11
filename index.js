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
    const workerUrl = url.origin;

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // 路由 1：管理後台首頁
    if (url.pathname === '/admin') return handleAdminPage(env);

    // 路由 2：後台 API 代理 (修復 POST 轉發邏輯)
    if (url.pathname.startsWith('/api/admin/')) {
      const user = request.headers.get('X-Admin-User');
      const pass = request.headers.get('X-Admin-Pass');
      if (user !== env.ADMIN_USERNAME || pass !== env.ADMIN_PASSWORD) return new Response('Unauthorized', { status: 401 });
      
      const action = url.pathname.replace('/api/admin/', '');
      const gasUrl = `${env.APPS_SCRIPT_URL}?action=${action}`;
      
      try {
        const fetchOptions = {
          method: request.method,
          redirect: 'follow',
          headers: { 'Accept': 'application/json' }
        };

        // 如果是 POST 請求，必須完整轉發 body
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

    // 路由 3：LIFF 頁面處理
    if (request.method === 'GET') {
      if (url.searchParams.has('orderId')) return handleLiffPayment(url, env, workerUrl);
      if (url.searchParams.has('id')) return handleLiffDescription(url, env);
      return handleStatusPage();
    }

    // 路由 4：LINE Webhook
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
  try { await fetch('https://api.line.me/v2/bot/chat/loading/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }, body: JSON.stringify({ chatId: userId, loadingSeconds: 5 }) }); } catch (e) {}
}

function handleStatusPage() {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>System Status</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-50 flex items-center justify-center min-h-screen font-sans text-center px-4"><div class="max-w-md w-full bg-white p-10 rounded-3xl shadow-xl"><div class="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6"><svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div><h1 class="text-2xl font-black text-slate-900 mb-2">人生進化 Action</h1><p class="text-slate-500 mb-8 text-sm">系統服務連線中。管理請進入下方路徑：</p><a href="/admin" class="block w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-100">前往管理後台</a></div></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleAdminPage(env) {
  const html = `
    <!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>人生進化 Action Pro 管理後台</title><script src="https://cdn.tailwindcss.com"></script><style>body{font-family:-apple-system,sans-serif;background:#f8fafc}.nav-active{color:#2563eb;border-bottom:2px solid #2563eb;font-weight:600}.card-shadow{box-shadow:0 1px 3px 0 rgb(0 0 0 / 0.1)}</style></head>
    <body class="text-slate-800">
      <div id="login-screen" class="fixed inset-0 bg-slate-50 flex items-center justify-center z-50">
        <div class="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
          <h1 class="text-2xl font-black mb-2 text-center text-slate-900 tracking-tighter">人生進化 Action</h1>
          <p class="text-slate-500 text-sm mb-6 text-center">後台管理系統認證</p>
          <div class="space-y-4">
            <div><label class="text-[10px] font-bold text-slate-400 uppercase ml-1">帳號</label><input type="text" id="admin-user" class="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" placeholder="ADMIN"></div>
            <div><label class="text-[10px] font-bold text-slate-400 uppercase ml-1">密碼</label><input type="password" id="admin-pw" class="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" placeholder="Password"></div>
            <button onclick="doLogin()" id="login-btn" class="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-100">登入系統</button>
          </div>
          <div id="diag-msg" class="hidden mt-6 p-4 bg-red-50 text-red-700 text-[10px] font-mono rounded-lg border border-red-100 overflow-auto max-h-40"></div>
        </div>
      </div>
      <div id="app-screen" class="hidden"><header class="bg-white border-b sticky top-0 z-40"><div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between"><div class="flex items-center space-x-2"><div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">A</div><span class="font-bold text-lg text-slate-900">Sportsland Pro</span></div><nav class="flex space-x-8"><button onclick="showTab('dashboard')" id="nav-dashboard" class="nav-active py-5 text-sm transition">數據看板</button><button onclick="showTab('orders')" id="nav-orders" class="py-5 text-sm text-slate-500 hover:text-slate-900 transition">訂單管理</button><button onclick="showTab('courses')" id="nav-courses" class="py-5 text-sm text-slate-500 hover:text-slate-900 transition">課程維護</button><button onclick="showTab('users')" id="nav-users" class="py-5 text-sm text-slate-500 hover:text-slate-900 transition">學員名單</button></nav><button onclick="location.reload()" class="text-xs text-slate-400 hover:text-red-500 font-bold">登出</button></div></header><main class="max-w-7xl mx-auto p-6" id="main-content"></main></div>
      <script>
        let curUser="",curPass="",sysData=null;
        async function doLogin(){
          const u=document.getElementById('admin-user').value, p=document.getElementById('admin-pw').value;
          const btn=document.getElementById('login-btn'); const diag=document.getElementById('diag-msg');
          btn.disabled = true; btn.innerText = "驗證中..."; diag.classList.add('hidden');
          try {
            const res=await fetch('/api/admin/adminGetData',{headers:{'X-Admin-User':u,'X-Admin-Pass':p}});
            const text = await res.text();
            try {
              const json = JSON.parse(text);
              if(res.ok && json.status === 'success'){
                curUser=u; curPass=p; sysData=json;
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app-screen').classList.remove('hidden');
                showTab('dashboard');
              } else { alert('帳號或密碼錯誤'); }
            } catch(e) {
              diag.classList.remove('hidden');
              diag.innerText = "🚨 除錯：收到了 HTML 而非資料。請檢查 GAS 權限是否設為「所有人 (Anyone)」。\\n內容：\\n" + text.substring(0,300);
            }
          } catch(err) { alert('網路連線失敗'); }
          finally { btn.disabled = false; btn.innerText = "登入系統"; }
        }
        function showTab(tab){document.querySelectorAll('nav button').forEach(b=>{b.classList.remove('nav-active');b.classList.add('text-slate-500')});const ab=document.getElementById('nav-'+tab);if(ab){ab.classList.add('nav-active');ab.classList.remove('text-slate-500')}if(tab==='dashboard')renderDashboard();if(tab==='orders')renderOrders();if(tab==='courses')renderCourses();if(tab==='users')renderUsers()}
        function renderDashboard(){const d=sysData.data,pending=d.orders.filter(o=>o.status==='待匯款').length,income=d.orders.filter(o=>o.status==='已確認').reduce((s,o)=>s+(parseInt(o.amount)||0),0);document.getElementById('main-content').innerHTML=\`<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"><div class="bg-white p-6 rounded-2xl card-shadow"><div class="text-slate-400 text-[10px] font-black uppercase mb-2 tracking-widest">待處理訂單</div><div class="text-3xl font-black text-orange-500">\${pending} 筆</div></div><div class="bg-white p-6 rounded-2xl card-shadow"><div class="text-slate-400 text-[10px] font-black uppercase mb-2 tracking-widest">累計課程收入</div><div class="text-3xl font-black text-emerald-600">$\${income.toLocaleString()}</div></div><div class="bg-white p-6 rounded-2xl card-shadow"><div class="text-slate-400 text-[10px] font-black uppercase mb-2 tracking-widest">總學員數</div><div class="text-3xl font-black text-blue-600">\${d.users.length} 位</div></div></div><div class="bg-white p-8 rounded-2xl card-shadow"><h2 class="font-bold text-lg mb-4">系統狀態</h2><div class="flex items-center text-slate-400 text-xs"><div class="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></div>已連線 - Google Sheets 資料同步正常</div></div>\`}
        function renderOrders(){let rows=sysData.data.orders.map(o=>\`<tr class="hover:bg-slate-50 border-b border-slate-50"><td class="py-4 px-4 text-[10px] font-mono text-slate-400">\${o.orderId}</td><td class="py-4 px-4 font-bold text-sm">\${o.name||'訪客'}</td><td class="py-4 px-4 text-xs text-slate-600">\${o.courseName}</td><td class="py-4 px-4 font-black text-blue-600 text-sm">$\${o.amount}</td><td class="py-4 px-4"><span class="px-2 py-1 rounded-full text-[9px] font-black uppercase \${o.status==='已確認'?'bg-emerald-100 text-emerald-700':o.status==='待匯款'?'bg-orange-100 text-orange-700':'bg-slate-100 text-slate-400'}">\${o.status}</span></td><td class="py-4 px-4 font-mono text-xs text-blue-500 font-bold">\${o.last5||'-'}</td><td class="py-4 px-4 text-right"><button onclick="updateOrderStatus('\${o.orderId}','已確認')" class="text-blue-600 font-black text-[10px] hover:underline mr-4 uppercase">確認</button><button onclick="updateOrderStatus('\${o.orderId}','已取消')" class="text-slate-300 font-black text-[10px] hover:text-red-500 transition uppercase">取消</button></td></tr>\`).join('');document.getElementById('main-content').innerHTML=\`<div class="bg-white rounded-2xl card-shadow overflow-hidden"><table class="w-full text-left"><thead class="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest border-b"><tr><th class="py-4 px-4">ID</th><th class="py-4 px-4">NAME</th><th class="py-4 px-4">COURSE</th><th class="py-4 px-4">PRICE</th><th class="py-4 px-4">STATUS</th><th class="py-4 px-4">BANK</th><th class="py-4 px-4 text-right">ACTION</th></tr></thead><tbody>\${rows}</tbody></table></div>\`}
        function renderCourses(){let cards=sysData.data.courses.map(c=>\`<div class="bg-white p-6 rounded-2xl card-shadow border border-transparent hover:border-blue-100 transition"><div class="flex justify-between items-start mb-6"><h3 class="font-bold text-slate-900 text-sm">\${c.name}</h3><span class="text-[9px] bg-slate-50 px-2 py-1 rounded text-slate-400 font-mono">\${c.id}</span></div><div class="space-y-5"><div><label class="text-[9px] font-black text-slate-300 uppercase tracking-widest">階段分類</label><input id="cat-\${c.id}" value="\${c.category}" class="w-full border-b border-slate-100 py-1 text-xs outline-none focus:border-blue-500 transition font-bold"></div><div><label class="text-[9px] font-black text-slate-300 uppercase tracking-widest">預約訂金 (NT$)</label><input id="price-\${c.id}" type="number" value="\${c.price}" class="w-full border-b border-slate-100 py-1 text-xl font-black text-blue-600 outline-none focus:border-blue-500 transition"></div><button onclick="saveCourse('\${c.id}')" class="w-full bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black hover:bg-black transition uppercase tracking-widest shadow-lg shadow-slate-200">更新設定</button></div></div>\`).join('');document.getElementById('main-content').innerHTML=\`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">\${cards}</div>\`}
        function renderUsers(){let rows=sysData.data.users.map(u=>\`<tr class="hover:bg-slate-50 transition border-b border-slate-50"><td class="py-4 px-4 text-[10px] font-mono text-slate-400">\${u.uid}</td><td class="py-4 px-4 font-bold text-sm">\${u.name}</td><td class="py-4 px-4 text-xs font-mono text-slate-500">\${u.phone}</td><td class="py-4 px-4 text-[10px] text-slate-400 font-bold uppercase">\${u.time}</td></tr>\`).join('');document.getElementById('main-content').innerHTML=\`<div class="bg-white rounded-2xl card-shadow overflow-hidden"><table class="w-full text-left tracking-tight"><thead class="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest border-b"><tr><th class="py-4 px-4">UID</th><th class="py-4 px-4">NAME</th><th class="py-4 px-4">PHONE</th><th class="py-4 px-4">JOIN DATE</th></tr></thead><tbody>\${rows}</tbody></table></div>\`}
        async function updateOrderStatus(oid,status){if(!confirm('確定執行狀態變更？'))return;const res=await fetch('/api/admin/adminUpdateOrder',{method:'POST',headers:{'X-Admin-User':curUser,'X-Admin-Pass':curPass,'Content-Type':'application/json'},body:JSON.stringify({action:'adminUpdateOrder',data:{orderId:oid,status:status}})});if(res.ok)doRefresh()}
        async function saveCourse(cid){const p=document.getElementById('price-'+cid).value,c=document.getElementById('cat-'+cid).value;const res=await fetch('/api/admin/adminUpdateCourse',{method:'POST',headers:{'X-Admin-User':curUser,'X-Admin-Pass':curPass,'Content-Type':'application/json'},body:JSON.stringify({action:'adminUpdateCourse',data:{id:cid,price:p,category:c}})});if(res.ok){alert('課程已同步');doRefresh()}}
        async function doRefresh(){const res=await fetch('/api/admin/adminGetData',{headers:{'X-Admin-User':curUser,'X-Admin-Pass':curPass}});const json=await res.json();sysData=json;showTab(document.querySelector('.nav-active').id.replace('nav-',''))}
      </script>
    </body></html>
  `;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffPayment(url, env, workerUrl) {
  const orderId = url.searchParams.get('orderId');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>匯款回報</title><style>body{font-family:sans-serif;margin:0;background:#f4f7f9}.header{background:#1DB446;color:white;padding:25px;text-align:center}.container{padding:15px;max-width:500px;margin:auto}.card{background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:15px}input{width:100%;padding:12px;border:1px solid #e0e0e0;border-radius:8px;box-sizing:border-box;margin-bottom:15px}.btn{background:#007AFF;color:white;padding:16px;border-radius:12px;border:none;width:100%;font-size:17px;font-weight:bold}</style></head><body><div class="header">回報匯款資訊</div><div class="container"><div id="loading" style="text-align:center;padding:50px">檢查資料中...</div><form id="payForm" style="display:none"><div class="card"><div id="d-oid"></div><div id="d-name"></div></div><div class="card"><input type="text" id="name" placeholder="姓名" required><input type="tel" id="phone" placeholder="電話" required><input type="number" id="last5" placeholder="帳號末五碼" required></div><button type="submit" class="btn" id="subBtn">送出回報</button></form></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>const oid="${orderId}";const gas="${env.APPS_SCRIPT_URL}";liff.init({liffId:"2009130603-ktCTGk6d"}).then(async()=>{if(!liff.isLoggedIn()){liff.login();return}const uid=liff.getDecodedIDToken().sub;try{const[oR,pR]=await Promise.all([fetch(gas+"?action=getUserOrders&lineUid="+uid).then(r=>r.json()),fetch(gas+"?action=getUserProfile&lineUid="+uid).then(r=>r.json())]);const o=oR.data.find(x=>x.orderId===oid);if(!o){document.getElementById('loading').innerText='單號不存在';return}document.getElementById('d-oid').innerText="單號: "+o.orderId;document.getElementById('d-name').innerText="課程: "+o.courseName;if(pR.data){document.getElementById('name').value=pR.data.name||"";document.getElementById('phone').value=pR.data.phone||""}document.getElementById('loading').style.display='none';document.getElementById('payForm').style.display='block'}catch(e){alert("資料載入失敗，請檢查 GAS 權限。")}});document.getElementById('payForm').onsubmit=async(e)=>{e.preventDefault();document.getElementById('subBtn').disabled=true;const res=await fetch(gas,{method:'POST',body:JSON.stringify({action:'reportPayment',data:{orderId:oid,name:document.getElementById('name').value,phone:document.getElementById('phone').value,last5:document.getElementById('last5').value,courseName:document.getElementById('d-name').innerText}})});const r=await res.json();if(r.status==='success'){alert('成功');liff.closeWindow()}else{alert('失敗');document.getElementById('subBtn').disabled=false}}; </script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffDescription(url, env) {
  const cid = url.searchParams.get('id');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:sans-serif;margin:0;background:#fff}img{width:100%;height:auto;background:#eee}.content{padding:20px}.price{color:#f00;font-weight:bold;font-size:22px}.desc{line-height:1.7;white-space:pre-wrap;font-size:18px}.btn-box{position:fixed;bottom:0;width:100%;padding:15px;background:#fff;border-top:1px solid #eee}.btn{background:#007AFF;color:#fff;padding:14px;border-radius:10px;width:100%;font-weight:bold;font-size:18px;border:none}</style></head><body><div id="loading" style="padding:100px;text-align:center">讀取中...</div><div id="app" style="display:none"><img id="c-img"><div class="content"><h1 id="c-name"></h1><div class="price" id="c-price"></div><div id="c-desc" class="desc"></div></div></div><div class="btn-box" id="btn-c" style="display:none"><button class="btn" onclick="liff.closeWindow()">關閉視窗</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>liff.init({ liffId: "2009130603-ktCTGk6d" }).then(() => { fetch("${env.APPS_SCRIPT_URL}?action=getCourseList").then(r=>r.json()).then(res=>{ const c=res.data.find(x=>x.id==="${cid}"); if(c){ document.getElementById('c-img').src=c.imageUrl; document.getElementById('c-name').innerText=c.name; document.getElementById('c-price').innerText="NT $"+c.price+" 起"; document.getElementById('c-desc').innerText=c.description; document.getElementById('loading').style.display='none'; document.getElementById('app').style.display='block'; document.getElementById('btn-c').style.display='block' } }).catch(e=>alert("資料載入失敗，請檢查 GAS 權限。")) })</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
