const db = require('./db');
const OPEN = 9, CLOSE = 19, LUNCH = [12, 13], STEP = 30;
const MIN_CANCEL_H = 2, MAX_DAYS = 60;

const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function getSlots(barberId, date, duration, ignoreId = 0) {
  const day = new Date(date + 'T00:00');
  const now = new Date();
  if (isNaN(day) || day.getDay() === 0) return [];                 // domingo fechado
  if (day > new Date(now.getTime() + MAX_DAYS * 864e5)) return []; // muito distante

  const busy = db.prepare(`SELECT start_at, end_at FROM appointments
    WHERE barber_id=? AND status='confirmed' AND id<>? AND start_at LIKE ?`)
    .all(barberId, ignoreId, date + '%');

  const slots = [];
  for (let m = OPEN * 60; m + duration <= CLOSE * 60; m += STEP) {
    if (m < LUNCH[1] * 60 && m + duration > LUNCH[0] * 60) continue; // choca com almoço
    const s = new Date(day); s.setMinutes(m);
    if (s <= now) continue;                                          // passado
    const a = fmt(s), b = fmt(new Date(s.getTime() + duration * 60000));
    if (busy.some(x => a < x.end_at && b > x.start_at)) continue;    // sobreposição
    slots.push(a);
  }
  return slots;
}
module.exports = { getSlots, fmt, MIN_CANCEL_H };