const router = require('express').Router();
const db = require('./db');
const { auth, only } = require('./auth');
const { getSlots, fmt, MIN_CANCEL_H } = require('./rules');
const { notify, when } = require('./reminders');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hoursUntil = iso => (new Date(iso) - Date.now()) / 3600e3;
const getService = id => db.prepare('SELECT * FROM services WHERE id=? AND active=1').get(id);

/* ---------- Serviços (barbeiro gerencia) ---------- */
router.get('/services', (_, res) => res.json(db.prepare('SELECT * FROM services WHERE active=1').all()));
router.get('/barbers', (_, res) => res.json(db.prepare("SELECT id,name FROM users WHERE role='barber'").all()));

router.post('/services', auth, only('barber'), (req, res) => {
  const { name, duration_min, price_cents } = req.body;
  if (!name || !(duration_min >= 15) || !(price_cents >= 0)) return res.status(400).json({ error: 'Dados inválidos' });
  const r = db.prepare('INSERT INTO services(name,duration_min,price_cents) VALUES(?,?,?)').run(name, duration_min, price_cents);
  res.status(201).json({ id: r.lastInsertRowid });
});
router.put('/services/:id', auth, only('barber'), (req, res) => {
  const { name, duration_min, price_cents } = req.body;
  db.prepare('UPDATE services SET name=?, duration_min=?, price_cents=? WHERE id=?').run(name, duration_min, price_cents, req.params.id);
  res.json({ ok: true });
});
router.delete('/services/:id', auth, only('barber'), (req, res) => { // exclusão lógica: preserva histórico
  db.prepare('UPDATE services SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Disponibilidade ---------- */
router.get('/availability', auth, (req, res) => {
  const { barberId, serviceId, date } = req.query;
  const s = getService(serviceId);
  if (!s || !DATE_RE.test(date || '')) return res.status(400).json({ error: 'Parâmetros inválidos' });
  res.json(getSlots(barberId, date, s.duration_min));
});

/* ---------- CREATE ---------- */
const createTx = db.transaction((clientId, barberId, svc, start) => {
  if (!getSlots(barberId, start.slice(0, 10), svc.duration_min).includes(start)) throw new Error('SLOT');
  const active = db.prepare("SELECT COUNT(*) c FROM appointments WHERE client_id=? AND status='confirmed' AND start_at>?")
    .get(clientId, fmt(new Date())).c;
  if (active >= 3) throw new Error('LIMIT');
  const end = fmt(new Date(new Date(start).getTime() + svc.duration_min * 60000));
  const r24 = hoursUntil(start) <= 24 ? 1 : 0; // já dentro da janela: não manda "24h antes"
  return db.prepare(`INSERT INTO appointments(client_id,barber_id,service_id,start_at,end_at,reminder_24h)
    VALUES(?,?,?,?,?,?)`).run(clientId, barberId, svc.id, start, end, r24).lastInsertRowid;
});

router.post('/appointments', auth, only('client'), (req, res) => {
  const { barber_id, service_id, start_at } = req.body;
  const svc = getService(service_id);
  if (!svc || !barber_id || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start_at || ''))
    return res.status(400).json({ error: 'Dados inválidos' });
  try {
    const id = createTx(req.user.id, barber_id, svc, start_at);
    notify(req.user.id, 'Agendamento confirmado ✅', `Seu ${svc.name} está confirmado para ${when(start_at)}.`); // confirmação automática
    res.status(201).json({ id, status: 'confirmed' });
  } catch (e) {
    if (e.message === 'SLOT') return res.status(409).json({ error: 'Horário indisponível. Escolha outro.' });
    if (e.message === 'LIMIT') return res.status(409).json({ error: 'Você já tem 3 agendamentos ativos.' });
    throw e;
  }
});

/* ---------- READ ---------- */
router.get('/appointments', auth, (req, res) => {
  const base = `SELECT a.*, s.name service, s.price_cents, u.name client_name, u.phone client_phone, b.name barber_name
    FROM appointments a JOIN services s ON s.id=a.service_id
    JOIN users u ON u.id=a.client_id JOIN users b ON b.id=a.barber_id`;
  if (req.user.role === 'barber') {
    const date = DATE_RE.test(req.query.date || '') ? req.query.date : fmt(new Date()).slice(0, 10);
    return res.json(db.prepare(`${base} WHERE a.start_at LIKE ? ORDER BY a.start_at`).all(date + '%'));
  }
  res.json(db.prepare(`${base} WHERE a.client_id=? AND a.start_at>=? ORDER BY a.start_at`)
    .all(req.user.id, fmt(new Date())));
});

/* ---------- UPDATE (remarcar ou mudar status) ---------- */
router.patch('/appointments/:id', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Não encontrado' });
  const isBarber = req.user.role === 'barber';
  if (!isBarber && a.client_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
  if (a.status !== 'confirmed') return res.status(409).json({ error: 'Este agendamento não pode ser alterado' });

  const { status, start_at } = req.body;
  if (status) { // só o barbeiro conclui
    if (!isBarber || !['done', 'no_show'].includes(status)) return res.status(403).json({ error: 'Sem permissão' });
    db.prepare('UPDATE appointments SET status=? WHERE id=?').run(status, a.id);
    return res.json({ ok: true });
  }
  if (!isBarber && hoursUntil(a.start_at) < MIN_CANCEL_H)
    return res.status(409).json({ error: `Remarque com pelo menos ${MIN_CANCEL_H}h de antecedência` });

  const svc = db.prepare('SELECT * FROM services WHERE id=?').get(a.service_id);
  const ok = DATE_RE.test((start_at || '').slice(0, 10)) &&
    getSlots(a.barber_id, start_at.slice(0, 10), svc.duration_min, a.id).includes(start_at);
  if (!ok) return res.status(409).json({ error: 'Horário indisponível' });

  const end = fmt(new Date(new Date(start_at).getTime() + svc.duration_min * 60000));
  db.prepare('UPDATE appointments SET start_at=?, end_at=?, reminder_24h=?, reminder_1h=0 WHERE id=?')
    .run(start_at, end, hoursUntil(start_at) <= 24 ? 1 : 0, a.id);
  notify(a.client_id, 'Agendamento remarcado', `Seu horário foi remarcado para ${when(start_at)}.`);
  res.json({ ok: true });
});

/* ---------- DELETE (cancelamento lógico) ---------- */
router.delete('/appointments/:id', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Não encontrado' });
  const isBarber = req.user.role === 'barber';
  if (!isBarber && a.client_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
  if (a.status !== 'confirmed') return res.status(409).json({ error: 'Já finalizado ou cancelado' });
  if (!isBarber && hoursUntil(a.start_at) < MIN_CANCEL_H)
    return res.status(409).json({ error: `Cancelamento só até ${MIN_CANCEL_H}h antes` });
  db.prepare("UPDATE appointments SET status='cancelled' WHERE id=?").run(a.id);
  notify(a.client_id, 'Agendamento cancelado', `O agendamento de ${when(a.start_at)} foi cancelado.`);
  res.json({ ok: true });
});

module.exports = router;