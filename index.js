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

    // 1. LIFF 路由優先權 (確保帶有參數的請求第一時間處理)
    const orderId = url.searchParams.get('orderId');
    const courseIdParam = url.searchParams.get('id');
    if (request.method === 'GET') {
      if (orderId) return handleLiffPayment(orderId, env);
      if (courseIdParam) return handleLiffDescription(courseIdParam, env);
    }

    // 2. 管理後台入口
    if (url.pathname === '/admin') return handleAdminPage(env);

    // 3. API 代理轉發 (同步 GAS)
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

    // 4. 首頁與系統狀態 (無參數的根路徑)
    if (request.method === 'GET' && url.pathname === '/') return handleStatusPage();

    // 5. LINE Webhook
    if (request.method === 'POST') {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response('OK');
        for (const event of body.events) {
          if (event.type === 'message' && event.message.type === 'text') {
            const text = event.message.text.trim();
            const aiKeywords = ['預約', '課程', '報名', '紀錄', '查', '訂單', '取消'];
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

async function triggerLoadingAnimation(u, env) {
  try {
    await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN },
      body: JSON.stringify({ chatId: u, loadingSeconds: 5 })
    });
  } catch (e) {}
}

function handleStatusPage() {
  const h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>人生進化 Action</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-50 flex items-center justify-center min-h-screen"><div class="max-w-md w-full bg-white p-12 rounded-[2.5rem] shadow-xl text-center border border-slate-100"><h1 class="text-2xl font-bold text-slate-800 mb-6 tracking-tight">人生進化 Action</h1><p class="text-slate-500 mb-8 text-sm">系統服務目前運作正常。</p><a href="/admin" class="block bg-blue-600 text-white py-4 rounded-xl font-semibold shadow-lg transition hover:bg-blue-700">進入管理系統</a></div></body></html>';
  return new Response(h, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleAdminPage(env) {
  const h = '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>管理後台 - 人生進化 Action</title><script src="https://cdn.tailwindcss.com"></script><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.nav-active{background:#eff6ff;color:#2563eb;font-weight:600}.m-ov{background:rgba(15,23,42,0.6);backdrop-filter:blur(6px)}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:10px}</style></head><body class="bg-slate-50 text-slate-800 min-h-screen flex"><div id="login-box" class="fixed inset-0 bg-slate-50 flex items-center justify-center z-[70]"><div class="w-full max-w-sm bg-white p-10 rounded-2xl shadow-xl border border-slate-100 text-center"><h1 class="text-2xl font-bold mb-1 tracking-tight text-slate-900">人生進化 Action</h1><p class="text-slate-400 text-xs mb-8 uppercase tracking-widest font-medium">Administrator</p><div class="space-y-4 text-left"><label class="text-[10px] font-bold text-slate-400 uppercase ml-1">管理員帳號</label><input type="text" id="admin-user" class="w-full border border-slate-200 p-4 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition text-sm" placeholder="Username"><label class="text-[10px] font-bold text-slate-400 uppercase ml-1">管理員密碼</label><input type="password" id="admin-pw" class="w-full border border-slate-200 p-4 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition text-sm" placeholder="Password"><button onclick="doLogin()" id="lbtn" class="w-full bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg transition mt-2">進入管理系統</button></div><div id="diag" class="hidden mt-6 p-4 bg-red-50 text-red-700 text-[10px] text-left rounded-lg font-mono overflow-auto max-h-40"></div></div></div><aside class="w-64 bg-white border-r border-slate-200 flex-none hidden md:flex flex-col"><div class="p-6 border-b border-slate-100"><h1 class="text-xl font-bold text-slate-800 tracking-tighter">人生進化 Action</h1></div><nav class="flex-1 p-4 space-y-1"><button onclick="st(\'dashboard\')" id="n-dashboard" class="flex items-center w-full p-3 text-slate-500 hover:bg-slate-50 rounded-xl transition font-medium">📊 營運統計</button><button onclick="st(\'courses\')" id="n-courses" class="flex items-center w-full p-3 text-slate-500 hover:bg-slate-50 rounded-xl transition font-medium">📖 課程管理</button><button onclick="st(\'orders\')" id="n-orders" class="flex items-center w-full p-3 text-slate-500 hover:bg-slate-50 rounded-xl transition font-medium">📜 訂單流水</button><button onclick="st(\'users\')" id="n-users" class="flex items-center w-full p-3 text-slate-500 hover:bg-slate-50 rounded-xl transition font-medium">👥 會員中心</button></nav><div class="p-6 border-t border-slate-100 text-center"><button onclick="location.reload()" class="text-xs text-slate-400 font-bold hover:text-red-500 uppercase transition tracking-wider">Sign Out</button></div></aside><main class="flex-1 flex flex-col min-w-0 overflow-hidden"><header class="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0"><div id="path-display" class="text-sm text-slate-400 font-medium">首頁 / 營運控制台</div><div class="flex items-center space-x-3"><span class="text-sm font-semibold text-slate-700">管理員</span><div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-200">A</div></div></header><section class="p-8 overflow-y-auto flex-1 bg-slate-50/40" id="main-section"></section></main><div id="mc" class="hidden fixed inset-0 flex items-center justify-center z-50 p-6 m-ov"><div class="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200"><div class="p-6 border-b flex justify-between items-center bg-white"><h2 class="text-lg font-bold text-slate-800">編輯課程詳情</h2><button onclick="cm(\'c\')" class="text-slate-400 hover:text-slate-600 text-3xl font-light">&times;</button></div><div class="p-8 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-10 text-sm text-slate-600 font-medium"><div><h3 class="font-bold text-emerald-600 border-l-4 border-emerald-500 pl-3 mb-6">基本資訊</h3><div class="space-y-4"><div><label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">課程 ID</label><input id="mi-id" readonly class="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-slate-400 font-mono text-sm"></div><div><label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">課程名稱</label><input id="mi-name" class="w-full border border-slate-200 p-3 rounded-xl focus:border-blue-500 outline-none transition font-semibold text-slate-800"></div><div><label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">階段分類</label><select id="mi-cat" class="w-full border border-slate-200 p-3 rounded-xl outline-none"><option>一般課程</option><option>工作坊課程</option><option>體驗課程</option></select></div></div></div><div><h3 class="font-bold text-blue-600 border-l-4 border-blue-500 pl-3 mb-6">費用設定</h3><div class="space-y-4"><div><label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">報名費用 (NT$)</label><input id="mi-price" type="number" class="w-full border border-slate-200 p-3 rounded-xl font-bold text-emerald-600 text-lg"></div><button onclick="saveC()" class="w-full bg-slate-900 text-white p-4 rounded-xl font-semibold shadow-lg hover:bg-black transition uppercase tracking-widest mt-4">儲存課程變更</button></div></div></div></div></div><div id="mo" class="hidden fixed inset-0 flex items-center justify-center z-50 p-6 m-ov"><div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-100"><div class="p-6 border-b flex justify-between items-center"><h2 class="text-lg font-bold text-slate-800">訂單狀態維修</h2><button onclick="cm(\'o\')" class="text-slate-400 hover:text-slate-600 text-2xl">&times;</button></div><div class="p-8 space-y-6 text-sm"><div><label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">處理狀態</label><select id="mos" class="w-full border border-slate-200 p-4 rounded-xl font-semibold outline-none focus:border-blue-500 transition"><option>待付款</option><option>已回報匯款</option><option>已確認</option><option>已取消</option></select></div><div><label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">實收金額</label><input id="mor" type="number" class="w-full border border-slate-200 p-4 rounded-xl font-bold text-emerald-600 text-xl outline-none"></div><button onclick="saveO()" class="w-full bg-blue-600 text-white p-5 rounded-xl font-semibold shadow-lg hover:bg-blue-700 transition">完成訂單更新</button></div></div></div><div id="loader" class="hidden fixed inset-0 flex items-center justify-center z-[100] bg-white/60 backdrop-blur-sm"><div class="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div></div><script>' + 
  'const State={data:null,tab:"dashboard",u:"",p:"",curId:null};' +
  'async function doLogin(){' +
    'const u=document.getElementById("admin-user").value,p=document.getElementById("admin-pw").value;' +
    'const b=document.getElementById("lbtn"),d=document.getElementById("diag");' +
    'b.innerText="正在驗證..."; d.classList.add("hidden");' +
    'try{' +
      'const r=await fetch("/api/admin/adminGetData",{headers:{"X-Admin-User":u,"X-Admin-Pass":p}});' +
      'const t=await r.text();' +
      'try{' +
        'const j=JSON.parse(t);' +
        'if(r.ok&&j.status==="success"){State.data=j.data; State.u=u; State.p=p; document.getElementById("login-box").classList.add("hidden"); st("dashboard");}' +
        'else{alert("認證失敗：帳號或密碼錯誤");}' +
      '}catch(e){d.classList.remove("hidden"); d.innerText="連線異常，收到了網頁內容而不是資料。請確認 GAS 權限。\\n\\n內容：" + t.substring(0,200);}' +
    '}catch(e){alert("連線失敗");}finally{b.innerText="進入管理系統";}' +
  '}' +
  'function st(t){' +
    'State.tab=t; document.querySelectorAll("aside nav button").forEach(b=>b.className="flex items-center w-full p-3 text-slate-500 hover:bg-slate-50 rounded-xl transition font-medium");' +
    'const ab=document.getElementById("n-"+t); if(ab)ab.className="flex items-center w-full p-3 nav-active"; render();' +
  '}' +
  'function render(){' +
    'const s=document.getElementById("main-section"); const path=document.getElementById("path-display"); const d=State.data;' +
    'if(State.tab==="dashboard"){' +
      'path.innerText="首頁 / 營運統計看板";' +
      'const inc=d.orders.filter(o=>o.status==="已確認").reduce((sm,o)=>sm+(parseInt(o.amount)||0),0);' +
      'const pend=d.orders.filter(o=>o.status==="待匯款").reduce((sm,o)=>sm+(parseInt(o.amount)||0),0);' +
      's.innerHTML=\'<div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">\'+\'<div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">\'+\'<div class="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">實收累計</div><div class="text-2xl font-bold text-emerald-500">$\'+inc.toLocaleString()+\'</div></div>\'+\'<div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div class="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">待收總額</div><div class="text-2xl font-bold text-orange-500">$\'+pend.toLocaleString()+\'</div></div>\'+\'<div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div class="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">有效報名筆數</div><div class="text-2xl font-bold text-blue-500">\'+d.orders.length+\'</div></div>\'+\'<div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div class="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">學員總數</div><div class="text-2xl font-bold text-purple-600">\'+d.users.length+\'</div></div></div>\'+\'<div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-100"><h2 class="font-bold text-base text-slate-800 mb-6 border-l-4 border-blue-600 pl-4 uppercase font-semibold">各課程營收狀態統計</h2>\'+\'<div class="overflow-x-auto"><table class="w-full text-left"><thead><tr class="bg-slate-50 text-[10px] text-slate-500 uppercase font-bold tracking-widest border-b border-slate-100"><th class="p-4">課程名稱</th><th class="p-4 text-center">報名數</th><th class="p-4 text-emerald-600">已實收</th><th class="p-4 text-orange-600">待收款</th><th class="p-4">繳費分佈</th></tr></thead><tbody class="text-sm font-medium text-slate-600">\' + d.courses.map(c=>{const ords=d.orders.filter(o=>o.courseName===c.name);return \'<tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"><td class="p-4 font-semibold text-slate-800">\'+c.name+\'</td><td class="p-4 text-center">\'+ords.length+\'</td><td class="p-4 text-emerald-600 font-semibold">$\'+(ords.filter(o=>o.status==="已確認").reduce((s,o)=>s+(parseInt(o.amount)||0),0)).toLocaleString()+\'</td><td class="p-4 text-orange-500 font-semibold">$\'+(ords.filter(o=>o.status==="待匯款").reduce((s,o)=>s+(parseInt(o.amount)||0),0)).toLocaleString()+\'</td><td class="p-4"><div class="flex items-center space-x-3 text-[10px] font-bold uppercase tracking-tighter text-slate-400">\'+\'<span class="text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded">Paid: \'+ords.filter(o=>o.status==="已確認").length+\'</span>\'+\'<span class="text-orange-500 bg-orange-50 px-2 py-0.5 rounded">Wait: \'+ords.filter(o=>o.status==="待匯款").length+\'</span></div></td></tr>\'}).join(\'\') + \'</tbody></table></div></div>\';' +
    '} else if(State.tab==="courses"){' +
      'path.innerText="首頁 / 課程管理中心";' +
      'let rows=d.courses.map(c=>{const ords=d.orders.filter(o=>o.courseName===c.name); return \'<tr class="hover:bg-slate-50 transition border-b border-slate-50 text-sm font-medium"><td class="p-5">\'+\'<div class="text-slate-800 text-base leading-tight mb-1 font-semibold">\'+c.name+\'</div><div class="text-[10px] font-mono text-slate-300 uppercase tracking-widest">\'+c.id+\'</div></td>\'+\'<td class="p-5"><span class="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">\'+c.category+\'</span></td>\'+\'<td class="p-5"><div class="text-xl font-bold text-emerald-500 font-mono tracking-tight">$\'+c.price+\'</div><div class="text-[10px] text-slate-400 font-medium">\'+ords.length+\' / 20 人</div></td>\'+\'<td class="p-5 text-right">\'+\'<button onclick="om(\\\'c\\\',\\\'\'+c.id+\'\\\')" class="text-slate-400 hover:text-blue-600 font-semibold transition px-6 py-2.5 border border-slate-100 rounded-xl text-xs uppercase bg-white">編輯</button></td></tr>\'}).join(\'\');' +
      's.innerHTML=\'<div class="bg-white rounded-[1.5rem] shadow-sm border border-slate-100 overflow-hidden"><table class="w-full text-left">\'+\'<thead class="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase border-b border-slate-100"><tr><th class="p-5">課程資訊</th><th class="p-5">分類</th><th class="p-5">費用/名額</th><th class="p-5 text-right">操作</th></tr></thead><tbody>\'+rows+\'</tbody></table></div>\';' +
    '} else if(State.tab==="orders"){' +
      'path.innerText="首頁 / 訂單管理流水";' +
      'let rows=d.orders.map(o=>\'<tr class="hover:bg-slate-50 transition border-b border-slate-50 text-sm font-medium text-slate-700 font-sans"><td class="p-5 font-mono text-[10px] text-slate-300">\'+o.orderId+\'</td><td class="p-5">\'+\'<div class="font-semibold text-slate-800 text-base mb-0.5">\'+(o.name||\'訪客\')+\'</div><div class="text-[10px] text-slate-400 font-mono tracking-tighter">\'+(o.phone||\'-\')+\'</div></td>\'+\'<td class="p-5 text-xs font-semibold text-slate-500">\'+o.courseName+\'</td>\'+\'<td class="p-5 font-bold text-blue-600 text-lg font-mono">$\'+o.amount+\'</td>\'+\'<td class="p-5"><span class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase \'+(o.status==="已確認"?"bg-emerald-100 text-emerald-700":o.status==="待匯款"?"bg-orange-100 text-orange-700":"bg-slate-100 text-slate-400")+\'">\'+o.status+\'</span></td>\'+\'<td class="p-5 font-mono text-xs text-blue-500 font-semibold tracking-widest">\'+(o.last5||\'-\')+\'</td>\'+\'<td class="p-5 text-right"><button onclick="om(\\\'o\\\',\\\'\'+o.orderId+\'\\\')" class="bg-slate-900 text-white px-6 py-3 rounded-2xl text-xs font-semibold shadow-sm hover:bg-black transition tracking-wider">維護</button></td></tr>\').join(\'\');' +
      's.innerHTML=\'<div class="bg-white rounded-[1.5rem] shadow-sm border border-slate-100 overflow-hidden"><table class="w-full text-left">\'+\'<thead class="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase border-b border-slate-100"><tr><th class="p-5">ID</th><th class="p-5">學員</th><th class="p-5">報名課程</th><th class="p-5">金額</th><th class="p-5">狀態</th><th class="p-5">末五</th><th class="p-5 text-right">管理</th></tr></thead><tbody class="text-sm">\'+rows+\'</tbody></table></div>\';' +
    '} else if(State.tab==="users"){' +
      'path.innerText="首頁 / 會員管理清單";' +
      'let rows=d.users.map(u=>\'<tr class="hover:bg-slate-50 transition border-b border-slate-50 text-sm font-medium"><td class="p-5 font-semibold text-slate-800 text-base">\'+u.name+\'</td>\'+\'<td class="p-5 font-mono text-slate-600">\'+u.phone+\'</td>\'+\'<td class="p-5 text-[10px] text-slate-300 font-mono tracking-widest uppercase font-semibold">\'+u.uid+\'</td>\'+\'<td class="p-5 text-right text-slate-400 text-[10px] font-bold uppercase">\'+u.time+\'</td></tr>\').join(\'\');' +
      's.innerHTML=\'<div class="bg-white rounded-[1.5rem] shadow-sm border border-slate-100 overflow-hidden"><table class="w-full text-left">\'+\'<thead class="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase border-b border-slate-100"><tr><th class="p-5">姓名</th><th class="p-5">手機</th><th class="p-5">身分證/UID</th><th class="p-5 text-right">註冊日期</th></tr></thead><tbody>\'+rows+\'</tbody></table></div>\';' +
    '}' +
  '}' +
  'function om(m,id){' +
    'State.curId=id; if(m==="c"){ const c=State.data.courses.find(x=>x.id===id); document.getElementById("mi-id").value=c.id; document.getElementById("mi-name").value=c.name; document.getElementById("mi-price").value=c.price; document.getElementById("mi-cat").value=c.category; document.getElementById("mc").classList.remove("hidden"); }' +
    'if(m==="o"){ const o=State.data.orders.find(x=>x.orderId===id); document.getElementById("mos").value=o.status; document.getElementById("mor").value=o.amount; document.getElementById("mo").classList.remove("hidden"); }' +
  '}' +
  'function cm(m){ document.getElementById("m"+m).classList.add("hidden"); }' +
  'async function saveC(){ tl(true); try{ await fetch("/api/admin/adminUpdateCourse",{method:"POST",headers:{"X-Admin-User":State.u,"X-Admin-Pass":State.p,"Content-Type":"application/json"},body:JSON.stringify({action:"adminUpdateCourse",data:{id:State.curId,price:document.getElementById("mi-price").value,category:document.getElementById("mi-cat").value}})}); cm("c"); await rf(); alert("課程同步成功！"); }finally{tl(false);}' +
  '}' +
  'async function saveO(){ tl(true); try{ await fetch("/api/admin/adminUpdateOrder",{method:"POST",headers:{"X-Admin-User":State.u,"X-Admin-Pass":State.p,"Content-Type":"application/json"},body:JSON.stringify({action:"adminUpdateOrder",data:{orderId:State.curId,status:document.getElementById("mos").value,amount:document.getElementById("mor").value}})}); cm("o"); await rf(); alert("訂單更新成功！"); }finally{tl(false);}' +
  '}' +
  'async function rf(){ const r=await fetch("/api/admin/adminGetData",{headers:{"X-Admin-User":State.u,"X-Admin-Pass":State.p}}); const j=await r.json(); State.data=j.data; render(); }' +
  'function tl(v){ const l=document.getElementById("loader"); if(v)l.classList.remove("hidden"); else l.classList.add("hidden"); }' +
  '</script></body></html>';
  return new Response(h, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffPayment(orderId, env) {
  const h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>匯款回報</title><style>body{font-family:sans-serif;margin:0;background:#f4f7f9}.header{background:#1DB446;color:white;padding:30px;text-align:center;font-weight:bold;font-size:20px}.container{padding:15px;max-width:500px;margin:auto}.card{background:white;border-radius:20px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:15px}input{width:100%;padding:14px;border:1px solid #e2e8f0;border-radius:12px;box-sizing:border-box;margin-bottom:16px;outline:none}.btn{background:#007AFF;color:white;padding:18px;border-radius:16px;border:none;width:100%;font-size:18px;font-weight:bold;cursor:pointer}.label{font-size:12px;font-weight:bold;color:#94a3b8;text-transform:uppercase;margin-bottom:4px}</style></head><body><div class="header">回報匯款資訊</div><div class="container"><div id="loading" style="text-align:center;padding:50px;color:#64748b">正在讀取預約資料...</div><form id="payForm" style="display:none"><div class="card"><div class="label">預約單號</div><div id="d-oid" style="font-weight:bold;color:#1e293b;font-size:18px;font-family:monospace"></div><div class="label" style="margin-top:16px">預約課程</div><div id="d-name" style="font-size:15px;color:#475569;font-weight:600"></div></div><div class="card"><div class="label">報名姓名</div><input type="text" id="name" placeholder="請輸入真實姓名" required><div class="label">聯絡電話</div><input type="tel" id="phone" placeholder="請輸入手機號碼" required><div class="label">帳號末五碼</div><input type="number" id="last5" placeholder="請輸入匯款帳號末五碼" required></div><button type="submit" class="btn" id="subBtn">確認送出回報</button></form></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>' + 
  'const oid="' + orderId + '", gas="' + env.APPS_SCRIPT_URL + '";' + 
  'liff.init({liffId:"2009130603-ktCTGk6d"}).then(async()=>{' + 
    'if(!liff.isLoggedIn()){liff.login();return}' +
    'const uid=liff.getDecodedIDToken().sub;' + 
    'try{' + 
      'const oR=await fetch(gas+"?action=getUserOrders&lineUid="+uid).then(r=>r.json());' + 
      'const o=oR.data.find(x=>x.orderId===oid);' + 
      'if(!o){document.getElementById("loading").innerText="⚠️ 單號不存在或已被取消";return}' + 
      'document.getElementById("d-oid").innerText=o.orderId; document.getElementById("d-name").innerText=o.courseName;' + 
      'if(o.status==="已回報匯款"||o.status==="已確認"){alert("此單已完成回報。"); liff.closeWindow(); return}' + 
      'document.getElementById("loading").style.display="none"; document.getElementById("payForm").style.display="block";' + 
    '}catch(e){alert("資料載入失敗，請稍後再試。");}' + 
  '});' +
  'document.getElementById("payForm").onsubmit=async(e)=>{' + 
    'e.preventDefault(); document.getElementById("subBtn").disabled=true; document.getElementById("subBtn").innerText="傳送中...";' +
    'const res=await fetch(gas,{method:"POST",body:JSON.stringify({action:"reportPayment",data:{orderId:oid,name:document.getElementById("name").value,phone:document.getElementById("phone").value,last5:document.getElementById("last5").value,courseName:document.getElementById("d-name").innerText}})});' +
    'const r=await res.json(); if(r.status==="success"){alert("回報成功！我們將儘速處理。"); liff.closeWindow();}else{alert("失敗："+r.message); document.getElementById("subBtn").disabled=false; document.getElementById("subBtn").innerText="確認送出回報";}' +
  '};</script></body></html>';
  return new Response(h, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffDescription(cid, env) {
  const h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:sans-serif;margin:0;background:#fff}img{width:100%;height:auto;background:#f8fafc;display:block}.content{padding:24px}.price{color:#ef4444;font-weight:bold;font-size:26px;margin:12px 0}.desc{line-height:1.8;white-space:pre-wrap;font-size:16px;color:#334155}.btn-box{position:fixed;bottom:0;width:100%;padding:20px;background:rgba(255,255,255,0.9);backdrop-filter:blur(8px);border-top:1px solid #f1f5f9;box-sizing:border-box}.btn{background:#007AFF;color:#fff;padding:16px;border-radius:14px;width:100%;font-weight:bold;font-size:18px;border:none;cursor:pointer}</style></head><body><div id="loading" style="padding:100px;text-align:center;color:#64748b">正在載入詳情...</div><div id="app" style="display:none"><img id="c-img"><div class="content"><h1 id="c-name" style="font-size:24px;font-weight:bold;color:#1e293b;margin:0"></h1><div class="price" id="c-price"></div><div id="c-desc" class="desc"></div></div><div style="height:100px"></div></div><div class="btn-box" id="btn-c" style="display:none"><button class="btn" onclick="liff.closeWindow()">關閉詳情</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>' + 
  'liff.init({ liffId: "2009130603-ktCTGk6d" }).then(() => {' + 
    'fetch("' + env.APPS_SCRIPT_URL + '?action=getCourseList").then(r=>r.json()).then(res=>{' + 
      'const c=res.data.find(x=>x.id==="' + cid + '");' + 
      'if(c){ document.getElementById("c-img").src=c.imageUrl; document.getElementById("c-name").innerText=c.name; document.getElementById("c-price").innerText="NT $"+c.price+" 起"; document.getElementById("c-desc").innerText=c.description; document.getElementById("loading").style.display="none"; document.getElementById("app").style.display="block"; document.getElementById("btn-c").style.display="block"; }' + 
    '});' + 
  '});</script></body></html>';
  return new Response(h, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
