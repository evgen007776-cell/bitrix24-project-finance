const state = {
  view: 'dashboard',
  currentProjectId: null,
  projects: [], categories: [], employees: [],
  bitrixUser: null,
};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const content = $('#content');
const fmt = new Intl.NumberFormat('ru-RU', { style:'currency', currency:'RUB', maximumFractionDigits:0 });
const fmtNumber = new Intl.NumberFormat('ru-RU');
const today = () => new Date().toISOString().slice(0,10);

async function api(url, options={}) {
  const headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
  if (state.bitrixUser) headers['X-Bitrix-User'] = `${state.bitrixUser.ID}: ${state.bitrixUser.NAME || ''} ${state.bitrixUser.LAST_NAME || ''}`.trim();
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function statusLabel(status){ return status === 'active' ? 'В работе' : status === 'paused' ? 'Пауза' : 'Завершён'; }
function profitClass(v){ return Number(v) < 0 ? 'negative' : 'positive'; }
function profitabilityClass(v){ return Number(v) < 0 ? 'bad' : 'good'; }
function esc(v=''){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function initials(name=''){ return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || '?'; }

async function loadBase() {
  [state.projects, state.categories, state.employees] = await Promise.all([
    api('/api/projects'), api('/api/categories'), api('/api/employees')
  ]);
}

async function render() {
  await loadBase();
  $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.view === state.view));
  if (state.view === 'dashboard') return renderDashboard();
  if (state.view === 'projects') return renderProjects();
  if (state.view === 'categories') return renderCategories();
  if (state.view === 'employees') return renderEmployees();
  if (state.view === 'project') return renderProject(state.currentProjectId);
}

async function renderDashboard() {
  const data = await api('/api/dashboard');
  $('#pageTitle').textContent = 'Экономика проектов';
  $('#pageSubtitle').textContent = 'Доходы, расходы и эффективность в одном месте';
  const t = data.totals;
  content.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi income"><div class="label">Общий доход</div><div class="value">${fmt.format(t.income)}</div><div class="hint">по всем проектам</div></div>
      <div class="kpi expense"><div class="label">Общие расходы</div><div class="value">${fmt.format(t.expense)}</div><div class="hint">по всем статьям</div></div>
      <div class="kpi profit ${t.profit < 0 ? 'negative':''}"><div class="label">Прибыль</div><div class="value">${fmt.format(t.profit)}</div><div class="hint">доходы − расходы</div></div>
      <div class="kpi"><div class="label">Рентабельность</div><div class="value ${profitabilityClass(t.profitability)}">${t.profitability.toFixed(1)}%</div><div class="hint">прибыль / доход × 100%</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Проекты</h2><p>Сравнение финансовой эффективности</p></div><button class="btn secondary small" data-action="all-projects">Все проекты</button></div>
      ${projectTable(data.projects)}
    </div>`;
  bindProjectLinks();
  $('[data-action="all-projects"]')?.addEventListener('click', () => navigate('projects'));
}

function projectTable(projects) {
  if (!projects.length) return `<div class="empty"><strong>Проектов пока нет</strong>Создайте первый проект и добавьте финансовую операцию.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Проект</th><th>Статус</th><th>Доход</th><th>Расход</th><th>Прибыль</th><th>Рентаб.</th><th></th></tr></thead><tbody>
    ${projects.map(p => `<tr>
      <td><span class="project-name">${esc(p.name)}</span><span class="project-client">${esc(p.client || 'Без клиента')}</span></td>
      <td><span class="badge ${p.status}">${statusLabel(p.status)}</span></td>
      <td class="money income">${fmt.format(p.income)}</td><td class="money expense">${fmt.format(p.expense)}</td>
      <td class="money profit ${profitClass(p.profit)}">${fmt.format(p.profit)}</td>
      <td class="rentability ${profitabilityClass(p.profitability)}">${p.profitability.toFixed(1)}%</td>
      <td><button class="link-btn" data-project-id="${p.id}">Открыть →</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderProjects() {
  $('#pageTitle').textContent = 'Проекты';
  $('#pageSubtitle').textContent = `${state.projects.length} ${plural(state.projects.length, 'проект','проекта','проектов')} в системе`;
  content.innerHTML = state.projects.length ? `<div class="cards-grid">${state.projects.map(p => `
    <article class="project-card" data-project-card="${p.id}">
      <div class="top"><div><h3>${esc(p.name)}</h3><span class="project-client">${esc(p.client || 'Без клиента')}</span></div><span class="badge ${p.status}">${statusLabel(p.status)}</span></div>
      <p>${esc(p.description || 'Описание проекта не добавлено')}</p>
      <div class="project-stats"><div><small>Доход</small><b class="money income">${fmt.format(p.income)}</b></div><div><small>Прибыль</small><b class="${profitClass(p.profit)}">${fmt.format(p.profit)}</b></div><div><small>Рентаб.</small><b>${p.profitability.toFixed(1)}%</b></div></div>
    </article>`).join('')}</div>` : `<div class="panel"><div class="empty"><strong>Проектов пока нет</strong>Нажмите «Новый проект», чтобы начать учёт.</div></div>`;
  $$('[data-project-card]').forEach(el => el.addEventListener('click', () => openProject(Number(el.dataset.projectCard))));
}

async function renderProject(id) {
  const p = await api(`/api/projects/${id}`);
  $('#pageTitle').textContent = p.name;
  $('#pageSubtitle').textContent = p.client || 'Проект без клиента';
  content.innerHTML = `
    <div class="project-header"><div><button class="back" data-action="back">← Все проекты</button><h2>${esc(p.name)}</h2><p>${esc(p.description || 'Описание проекта не добавлено')}</p></div><span class="badge ${p.status}">${statusLabel(p.status)}</span></div>
    <div class="kpi-grid">
      <div class="kpi income"><div class="label">Доход</div><div class="value">${fmt.format(p.income)}</div></div>
      <div class="kpi expense"><div class="label">Расход</div><div class="value">${fmt.format(p.expense)}</div></div>
      <div class="kpi profit ${p.profit < 0 ? 'negative':''}"><div class="label">Прибыль</div><div class="value">${fmt.format(p.profit)}</div></div>
      <div class="kpi"><div class="label">Рентабельность</div><div class="value ${profitabilityClass(p.profitability)}">${p.profitability.toFixed(1)}%</div></div>
    </div>
    <div class="two-col">
      <div class="panel"><div class="panel-head"><div><h2>Операции</h2><p>${p.transactions.length} записей</p></div><button class="btn primary small" data-add-tx="${p.id}">+ Операция</button></div>${transactionTable(p.transactions)}</div>
      <div class="panel"><div class="panel-head"><div><h2>Команда</h2><p>${p.members.length} участников</p></div><button class="btn secondary small" data-add-member="${p.id}">+ Сотрудник</button></div><div class="panel-body">${teamList(p.members, p.id)}</div></div>
    </div>`;
  $('[data-action="back"]').addEventListener('click', () => navigate('projects'));
  $('[data-add-tx]').addEventListener('click', () => openOperationDialog(id));
  $('[data-add-member]').addEventListener('click', () => openMemberDialog(id));
  $$('[data-remove-tx]').forEach(b => b.addEventListener('click', async () => { if(confirm('Удалить финансовую операцию?')) { await api(`/api/transactions/${b.dataset.removeTx}`, {method:'DELETE'}); toast('Операция удалена'); render(); }}));
  $$('[data-remove-member]').forEach(b => b.addEventListener('click', async () => { await api(`/api/projects/${id}/members/${b.dataset.removeMember}`, {method:'DELETE'}); toast('Сотрудник удалён из проекта'); render(); }));
}

function transactionTable(rows) {
  if (!rows.length) return `<div class="empty"><strong>Операций пока нет</strong>Добавьте первый доход или расход.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Статья</th><th>Комментарий</th><th>Сумма</th><th></th></tr></thead><tbody>${rows.map(t => `<tr>
    <td>${new Date(t.transaction_date+'T00:00:00').toLocaleDateString('ru-RU')}</td><td>${esc(t.category_name)}</td><td>${esc(t.comment || '—')}</td>
    <td class="money ${t.type}">${t.type === 'expense' ? '−' : '+'}${fmt.format(t.amount)}</td><td><button class="remove-btn" title="Удалить" data-remove-tx="${t.id}">×</button></td>
  </tr>`).join('')}</tbody></table></div>`;
}

function teamList(members) {
  if (!members.length) return `<div class="empty" style="padding:25px 8px"><strong>Команда не назначена</strong>Добавьте сотрудников к проекту.</div>`;
  return `<div class="team-list">${members.map(m => `<div class="team-row"><div class="avatar">${initials(m.name)}</div><div class="team-info"><b>${esc(m.name)}</b><small>${esc(m.role || m.email || 'Участник проекта')}</small></div><button class="remove-btn" data-remove-member="${m.id}" title="Убрать">×</button></div>`).join('')}</div>`;
}

function renderCategories() {
  $('#pageTitle').textContent = 'Статьи доходов и расходов';
  $('#pageSubtitle').textContent = 'Справочник можно дополнять без изменения кода';
  const incomes = state.categories.filter(c=>c.type==='income'), expenses=state.categories.filter(c=>c.type==='expense');
  content.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Финансовые статьи</h2><p>Системные и пользовательские</p></div><button class="btn primary small" data-add-category>+ Новая статья</button></div><div class="panel-body category-columns">
    <div><h3>Доходы</h3><div class="category-list">${categoryRows(incomes)}</div></div>
    <div><h3>Расходы</h3><div class="category-list">${categoryRows(expenses)}</div></div>
  </div></div>`;
  $('[data-add-category]').addEventListener('click', () => $('#categoryDialog').showModal());
}
function categoryRows(rows){ return rows.map(c => `<div class="category-row"><span>${esc(c.name)}</span><small>${c.is_default ? 'системная' : 'пользовательская'}</small></div>`).join('') || '<div class="empty">Нет статей</div>'; }

function renderEmployees() {
  $('#pageTitle').textContent = 'Сотрудники';
  $('#pageSubtitle').textContent = 'Участников можно назначать на несколько проектов';
  content.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Справочник сотрудников</h2><p>${state.employees.length} записей</p></div><button class="btn primary small" data-add-employee>+ Сотрудник</button></div>${state.employees.length ? `<div class="table-wrap"><table><thead><tr><th>Сотрудник</th><th>Email</th><th>Bitrix24 ID</th></tr></thead><tbody>${state.employees.map(e=>`<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.email || '—')}</td><td>${esc(e.bitrix_user_id || '—')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><strong>Сотрудников пока нет</strong>Добавьте участника команды.</div>`}</div>`;
  $('[data-add-employee]').addEventListener('click', () => $('#employeeDialog').showModal());
}

function plural(n, one, few, many){ const a=Math.abs(n)%100,b=a%10; return a>10&&a<20?many:b>1&&b<5?few:b===1?one:many; }
function bindProjectLinks(){ $$('[data-project-id]').forEach(el => el.addEventListener('click', () => openProject(Number(el.dataset.projectId)))); }
function openProject(id){ state.currentProjectId=id; state.view='project'; render().catch(showError); }
function navigate(view){ state.view=view; state.currentProjectId=null; render().catch(showError); }
function showError(e){ console.error(e); toast(e.message || 'Ошибка'); }

function syncOperationCategories(type){
  const form=$('#operationForm'); const select=form.elements.category_id;
  const rows=state.categories.filter(c=>c.type===type);
  select.innerHTML=rows.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  form.elements.type.value=type;
  $$('[data-tx-type]', form).forEach(b=>b.classList.toggle('active',b.dataset.txType===type));
}
function openOperationDialog(projectId=null){
  const form=$('#operationForm');
  form.reset(); form.elements.transaction_date.value=today();
  form.elements.project_id.innerHTML=state.projects.map(p=>`<option value="${p.id}" ${p.id===projectId?'selected':''}>${esc(p.name)}</option>`).join('');
  syncOperationCategories('income');
  if(!state.projects.length){ toast('Сначала создайте проект'); return; }
  $('#operationDialog').showModal();
}
function openMemberDialog(projectId){
  if(!state.employees.length){ toast('Сначала добавьте сотрудника в справочник'); $('#employeeDialog').showModal(); return; }
  const form=$('#memberForm'); form.reset(); form.elements.project_id.value=projectId;
  form.elements.employee_id.innerHTML=state.employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
  $('#memberDialog').showModal();
}

$$('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog')?.close()));
$$('.nav-item').forEach(el => el.addEventListener('click', () => navigate(el.dataset.view)));
$('#addProjectBtn').addEventListener('click', () => { $('#projectForm').reset(); $('#projectDialog').showModal(); });
$('#addOperationBtn').addEventListener('click', () => openOperationDialog(state.currentProjectId));
$$('[data-tx-type]').forEach(btn => btn.addEventListener('click', () => syncOperationCategories(btn.dataset.txType)));
$('#quickCategoryBtn').addEventListener('click', () => { const type=$('#operationForm').elements.type.value; $('#categoryForm').reset(); $('#categoryForm').elements.type.value=type; $('#categoryDialog').showModal(); });

$('#projectForm').addEventListener('submit', async e => {
  e.preventDefault(); const fd=new FormData(e.currentTarget);
  try{ const p=await api('/api/projects',{method:'POST',body:JSON.stringify(Object.fromEntries(fd))}); $('#projectDialog').close(); toast('Проект создан'); await render(); openProject(p.id); }catch(err){showError(err)}
});
$('#operationForm').addEventListener('submit', async e => {
  e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget)); data.amount=Number(data.amount); data.project_id=Number(data.project_id); data.category_id=Number(data.category_id);
  try{ await api('/api/transactions',{method:'POST',body:JSON.stringify(data)}); $('#operationDialog').close(); toast(data.type==='income'?'Доход добавлен':'Расход добавлен'); await render(); }catch(err){showError(err)}
});
$('#categoryForm').addEventListener('submit', async e => {
  e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget));
  try{ const created=await api('/api/categories',{method:'POST',body:JSON.stringify(data)}); $('#categoryDialog').close(); toast('Статья добавлена'); await loadBase(); if($('#operationDialog').open){ syncOperationCategories(created.type); $('#operationForm').elements.category_id.value=created.id; } else await render(); }catch(err){showError(err)}
});
$('#employeeForm').addEventListener('submit', async e => {
  e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget));
  try{ await api('/api/employees',{method:'POST',body:JSON.stringify(data)}); $('#employeeDialog').close(); toast('Сотрудник добавлен'); await render(); }catch(err){showError(err)}
});
$('#memberForm').addEventListener('submit', async e => {
  e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget)); const projectId=Number(data.project_id);
  try{ await api(`/api/projects/${projectId}/members`,{method:'POST',body:JSON.stringify({employee_id:Number(data.employee_id),role:data.role})}); $('#memberDialog').close(); toast('Сотрудник добавлен в проект'); await render(); }catch(err){showError(err)}
});

async function initBitrix() {
  // If the app is opened inside Bitrix24, attempt to use the official JS SDK.
  // The application remains fully usable in standalone/demo mode if the SDK is unavailable.
  try {
    if (!window.BX24 && (new URLSearchParams(location.search).has('DOMAIN') || window.top !== window.self)) {
      await new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src='https://api.bitrix24.com/api/v1/'; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); });
    }
    if (window.BX24) {
      await new Promise(resolve => BX24.init(resolve));
      state.bitrixUser = await new Promise((resolve,reject) => BX24.callMethod('user.current', {}, r => r.error() ? reject(r.error()) : resolve(r.data())));
      $('#integrationTitle').textContent = `${state.bitrixUser.NAME || ''} ${state.bitrixUser.LAST_NAME || ''}`.trim() || 'Bitrix24';
      $('#integrationSubtitle').textContent = 'пользователь Битрикс24';
    }
  } catch (e) { console.info('Bitrix24 SDK not available, standalone mode', e); }
}

await initBitrix();
await render();
