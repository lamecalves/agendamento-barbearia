const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const STATUS = { confirmed: 'Confirmado', cancelled: 'Cancelado', done: 'Concluído', no_show: 'Faltou' };

let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
let registering = false;
const sel = { month: new Date(), date: null, slot: null, rescheduleId: null };

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2800); }

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/api' + path, {
    method, body: body && JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && token) logout();
  if (!r.ok) throw new Error(data.error || 'Erro inesperado');
  return data;
}
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

/* ---------- Auth ---------- */
$('#switch').onclick = () => {
  registering = !registering;
  $('#reg-fields').classList.toggle('hidden', !registering);
  $('#auth-title').textContent = registering ? 'Criar conta' : 'Entrar';
  $('#switch').textContent = registering ? 'Já tenho conta' : 'Criar conta';
};
$('#auth-form').onsubmit = safe(async e => {
  e.preventDefault();
  const body = { email: $('#f-email').value, password: $('#f-pass').value };
  if (registering) Object.assign(body, { name: $('#f-name').value, phone: $('#f-phone').value });
  const d = await api(registering ? '/auth/register' : '/auth/login', { method: 'POST', body });
  token = d.token; user = d.user;
  localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
  boot();
});
function logout() { localStorage.clear(); token = user = null; boot(); }
$('#logout').onclick = logout;

function boot() {
  $('#auth').classList.toggle('hidden', !!user);
  $('#userbox').classList.toggle('hidden', !user);
  $('#client').classList.toggle('hidden', user?.role !== 'client');
  $('#barber-view').classList.toggle('hidden', user?.role !== 'barber');
  if (!user) return;
  $('#username').textContent = user.name;
  user.role === 'client' ? initClient() : initBarber();
}

/* ---------- Cliente ---------- */
const svcSel = $('#service'), barSel = $('#barber');

const initClient = safe(async () => {
  const [services, barbers] = await Promise.all([api('/services'), api('/barbers')]);
  svcSel.innerHTML = services.map(s => `<option value="${s.id}">${esc(s.name)} · ${s.duration_min}min · R$ ${(s.price_cents / 100).toFixed(2)}</option>`).join('');
  barSel.innerHTML = barbers.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  renderCalendar(); loadMine();
});

function renderCalendar() {
  const m = sel.month, y = m.getFullYear(), mo = m.getMonth();
  $('#cal-title').textContent = m.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let html = ['D','S','T','Q','Q','S','S'].map(d => `<span class="dow">${d}</span>`).join('')
    + '<span></span>'.repeat(new Date(y, mo, 1).getDay());
  for (let d = 1; d <= new Date(y, mo + 1, 0).getDate(); d++) {
    const dt = new Date(y, mo, d), off = dt < today || dt.getDay() === 0;
    html += `<button class="day ${iso(dt) === sel.date ? 'active' : ''}" data-d="${iso(dt)}" ${off ? 'disabled' : ''}>${d}</button>`;
  }
  $('#cal-grid').innerHTML = html;
}
$('#prev').onclick = () => { sel.month = new Date(sel.month.getFullYear(), sel.month.getMonth() - 1, 1); renderCalendar(); };
$('#next').onclick = () => { sel.month = new Date(sel.month.getFullYear(), sel.month.getMonth() + 1, 1); renderCalendar(); };
$('#cal-grid').onclick = e => { const d = e.target.dataset.d; if (d) { sel.date = d; sel.slot = null; renderCalendar(); loadSlots(); } };
svcSel.onchange = barSel.onchange = () => { sel.slot = null; loadSlots(); };

const loadSlots = safe(async () => {
  $('#confirm').disabled = true;
  if (!sel.date) return;
  const slots = await api(`/availability?barberId=${barSel.value}&serviceId=${svcSel.value}&date=${sel.date}`);
  $('#slots').innerHTML = slots.length
    ? slots.map(s => `<button class="slot" data-s="${s}">${s.slice(11)}</button>`).join('')
    : '<p class="muted">Sem horários neste dia.</p>';
});
$('#slots').onclick = e => {
  const s = e.target.dataset.s; if (!s) return;
  sel.slot = s; $('#confirm').disabled = false;
  document.querySelectorAll('.slot').forEach(b => b.classList.toggle('active', b.dataset.s === s));
};

$('#confirm').onclick = safe(async () => {
  if (sel.rescheduleId) {
    await api('/appointments/' + sel.rescheduleId, { method: 'PATCH', body: { start_at: sel.slot } });
    toast('Agendamento remarcado!');
  } else {
    await api('/appointments', { method: 'POST', body: { barber_id: +barSel.value, service_id: +svcSel.value, start_at: sel.slot } });
    toast('Agendamento confirmado! Você receberá um lembrete.');
  }
  sel.rescheduleId = null; sel.slot = null; $('#book-title').textContent = 'Novo agendamento';
  loadSlots(); loadMine();
});

const loadMine = safe(async () => {
  const list = await api('/appointments');
  $('#my-list').innerHTML = list.filter(a => a.status === 'confirmed').map(a => `
    <div class="item">
      <div><strong>${esc(a.service)}</strong><br><span class="muted">${a.start_at.slice(8,10)}/${a.start_at.slice(5,7)} às ${a.start_at.slice(11)} · ${esc(a.barber_name)}</span></div>
      <div class="actions">
        <button data-act="resched" data-id="${a.id}">Remarcar</button>
        <button data-act="cancel" data-id="${a.id}">Cancelar</button>
      </div>
    </div>`).join('') || '<p class="muted">Nenhum horário marcado.</p>';
});
$('#my-list').onclick = safe(async e => {
  const { act, id } = e.target.dataset; if (!act) return;
  if (act === 'cancel' && confirm('Cancelar este horário?')) {
    await api('/appointments/' + id, { method: 'DELETE' }); toast('Cancelado'); loadMine();
  }
  if (act === 'resched') { sel.rescheduleId = id; $('#book-title').textContent = 'Escolha o novo horário'; toast('Selecione a nova data e horário'); }
});

/* ---------- Barbeiro ---------- */
function initBarber() { $('#agenda-date').value ||= iso(new Date()); loadAgenda(); }
$('#agenda-date').onchange = () => loadAgenda();

const loadAgenda = safe(async () => {
  const list = await api('/appointments?date=' + $('#agenda-date').value);
  $('#agenda').innerHTML = list.map(a => `
    <div class="item">
      <div><strong>${a.start_at.slice(11)}–${a.end_at.slice(11)} · ${esc(a.client_name)}</strong>
        <span class="badge">${STATUS[a.status]}</span><br>
        <span class="muted">${esc(a.service)} · ${esc(a.client_phone || 'sem telefone')}</span></div>
      ${a.status === 'confirmed' ? `<div class="actions">
        <button data-st="done" data-id="${a.id}">Concluir</button>
        <button data-st="no_show" data-id="${a.id}">Faltou</button>
        <button data-st="cancel" data-id="${a.id}">Cancelar</button></div>` : ''}
    </div>`).join('') || '<p class="muted">Nenhum agendamento neste dia.</p>';
});
$('#agenda').onclick = safe(async e => {
  const { st, id } = e.target.dataset; if (!st) return;
  if (st === 'cancel') await api('/appointments/' + id, { method: 'DELETE' });
  else await api('/appointments/' + id, { method: 'PATCH', body: { status: st } });
  loadAgenda();
});

boot();