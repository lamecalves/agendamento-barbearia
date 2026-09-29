const cron = require('node-cron'), db = require('./db');
const { fmt } = require('./rules');
const { sendMail } = require('./mailer');

async function notify(userId, subject, message) {
  const u = db.prepare('SELECT name,email FROM users WHERE id=?').get(userId);
  if (!u) return false;
  return sendMail({ to: u.email, name: u.name, subject, message });
}

const when = s => s.replace('T', ' às ');
let running = false;

function startReminders() {
  cron.schedule('* * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      for (const [col, hours, label] of [['reminder_24h', 24, 'amanhã'], ['reminder_1h', 1, 'em 1 hora']]) {
        const limit = fmt(new Date(now.getTime() + hours * 3600e3));
        const rows = db.prepare(`SELECT id, client_id, start_at FROM appointments
          WHERE status='confirmed' AND ${col}=0 AND start_at>? AND start_at<=?`).all(fmt(now), limit);
        for (const r of rows) {
          const ok = await notify(r.client_id, 'Lembrete do seu horário',
            `Seu horário é ${label}: ${when(r.start_at)}. Estamos te esperando!`);
          if (ok) db.prepare(`UPDATE appointments SET ${col}=1 WHERE id=?`).run(r.id);
        }
      }
    } finally { running = false; }
  });
}
module.exports = { notify, startReminders, when };