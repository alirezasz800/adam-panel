export const HTML = String.raw`<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#101827">
<title>پنل آدام</title>
<style>
:root{color-scheme:dark;font-family:Tahoma,Arial,sans-serif;background:#0b1220;color:#e5e7eb}
*{box-sizing:border-box}body{margin:0;padding:24px}.wrap{max-width:920px;margin:auto}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}
h1{font-size:25px;margin:0}p{color:#aab4c4;line-height:1.8}
.card{background:#121d2e;border:1px solid #26354b;border-radius:14px;padding:18px;margin:14px 0}
input,button{font:inherit;border-radius:9px;padding:11px;border:1px solid #35445b}
input{background:#0b1423;color:#fff;width:100%;margin:6px 0 12px}
button{background:#2563eb;color:white;border:0;cursor:pointer}
button.secondary{background:#334155}button.danger{background:#991b1b}
button:disabled{opacity:.5;cursor:not-allowed}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row>*{flex:1}
small,.muted{color:#9aa8ba}.hidden{display:none!important}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{text-align:right;padding:10px;border-bottom:1px solid #2a394d;font-size:14px}
.status{padding:4px 8px;border-radius:20px;background:#174b35;color:#a7f3d0}
#notice{min-height:24px;color:#fbbf24}
@media(max-width:600px){body{padding:14px}.row{display:block}.row button{width:100%;margin:4px 0}table{display:block;overflow:auto;white-space:nowrap}}
</style>
</head>
<body><main class="wrap">
<header><h1>پنل آدام</h1><button id="logout" class="secondary hidden">خروج</button></header>
<p>نسخه مدیریتی اولیه — مدیریت کاربران و وضعیت پنل. تونل VPN هنوز فعال نیست.</p>
<div id="notice" role="status"></div>
<section id="login" class="card">
<h2>ورود مدیر</h2>
<label for="password">رمز مدیریت</label>
<input id="password" type="password" autocomplete="current-password" minlength="16">
<button id="loginBtn">ورود</button>
</section>
<section id="panel" class="hidden">
<div class="card">
<h2>افزودن کاربر</h2>
<div class="row">
<div><label for="name">نام کاربر</label><input id="name" maxlength="60" placeholder="مثلاً کاربر ۱"></div>
<div><label for="limit">محدودیت حجم (GB، صفر یعنی بدون محدودیت ثبت‌شده)</label><input id="limit" type="number" min="0" max="100000" value="0"></div>
<div><label for="connections">حداکثر اتصال</label><input id="connections" type="number" min="1" max="20" value="3"></div>
</div>
<button id="addBtn">افزودن کاربر</button>
</div>
<div class="card">
<div class="row"><h2>کاربران</h2><button id="refresh" class="secondary">به‌روزرسانی</button></div>
<p class="muted" id="capacity"></p>
<div id="users"></div>
</div>
</section>
</main>
<script>
const $ = id => document.getElementById(id);
const notice = message => { $("notice").textContent = message || ""; };
async function api(path, options={}) {
  const response = await fetch(path, { credentials:"same-origin", ...options,
    headers: { "content-type":"application/json", ...(options.headers||{}) } });
  const data = await response.json().catch(()=>({ok:false,error:"پاسخ نامعتبر از سرور"}));
  if (!response.ok) throw new Error(data.error || "خطای سرور");
  return data;
}
function showPanel(yes) {
  $("login").classList.toggle("hidden", yes);
  $("panel").classList.toggle("hidden", !yes);
  $("logout").classList.toggle("hidden", !yes);
}
async function loadUsers() {
  const data = await api("/api/users");
  $("capacity").textContent = "تعداد کاربران: " + data.users.length + " از " + data.max_users;
  const host = $("users");
  host.replaceChildren();
  if (!data.users.length) { host.textContent = "هنوز کاربری ساخته نشده است."; return; }
  const table = document.createElement("table");
  const head = document.createElement("tr");
  ["نام","وضعیت","حجم مصرف‌شده","حداکثر اتصال","عملیات"].forEach(t=>{const th=document.createElement("th");th.textContent=t;head.append(th);});
  const thead=document.createElement("thead");thead.append(head);table.append(thead);
  const tbody=document.createElement("tbody");
  for (const user of data.users) {
    const tr=document.createElement("tr");
    const name=document.createElement("td");name.textContent=user.name;tr.append(name);
    const status=document.createElement("td");status.textContent=user.is_active ? "فعال" : "غیرفعال";tr.append(status);
    const used=document.createElement("td");used.textContent=(Number(user.traffic_used_bytes||0)/1073741824).toFixed(3)+" GB";tr.append(used);
    const connections=document.createElement("td");connections.textContent=String(user.max_connections);tr.append(connections);
    const actions=document.createElement("td");
    const toggle=document.createElement("button");toggle.className="secondary";toggle.textContent=user.is_active?"غیرفعال‌کردن":"فعال‌کردن";
    toggle.addEventListener("click",async()=>{try{await api("/api/users/" + user.id,{method:"PATCH",body:JSON.stringify({is_active:!Boolean(user.is_active)})});await loadUsers();notice("وضعیت کاربر تغییر کرد.");}catch(e){notice(e.message);}});
    const del=document.createElement("button");del.className="danger";del.textContent="حذف";
    del.addEventListener("click",async()=>{if(!confirm("این کاربر حذف شود؟"))return;try{await api("/api/users/" + user.id,{method:"DELETE"});await loadUsers();notice("کاربر حذف شد.");}catch(e){notice(e.message);}});
    actions.append(toggle,document.createTextNode(" "),del);tr.append(actions);tbody.append(tr);
  }
  table.append(tbody);host.append(table);
}
async function checkSession() {
  try { await api("/api/me"); showPanel(true); await loadUsers(); }
  catch { showPanel(false); }
}
$("loginBtn").addEventListener("click",async()=>{
  try { await api("/api/login",{method:"POST",body:JSON.stringify({password:$("password").value})});$("password").value="";showPanel(true);await loadUsers();notice("با موفقیت وارد شدی."); }
  catch(e){notice(e.message);}
});
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")$("loginBtn").click();});
$("addBtn").addEventListener("click",async()=>{
  const name=$("name").value.trim(), limit=Number($("limit").value), connections=Number($("connections").value);
  try { await api("/api/users",{method:"POST",body:JSON.stringify({name,traffic_limit_gb:limit,max_connections:connections})});$("name").value="";await loadUsers();notice("کاربر ساخته شد."); }
  catch(e){notice(e.message);}
});
$("refresh").addEventListener("click",()=>loadUsers().catch(e=>notice(e.message)));
$("logout").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST"});}finally{showPanel(false);notice("خارج شدی.");}});
checkSession();
</script></body></html>`;
