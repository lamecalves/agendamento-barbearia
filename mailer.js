const nodemailer = require('nodemailer');

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
const enabled = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
const port = Number(SMTP_PORT) || 587;

const transporter = enabled
  ? nodemailer.createTransport({
      host: SMTP_HOST, port,
      secure: port === 465,               // 465 = SSL direto; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

if (transporter) {
  transporter.verify()
    .then(() => console.log('✉️  SMTP pronto'))
    .catch(e => console.error('✉️  Falha no SMTP:', e.message));
} else {
  console.warn('✉️  SMTP não configurado: e-mails serão apenas exibidos no console.');
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function template(name, title, message) {
  return `
  <div style="background:#000000;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:480px;margin:auto;border:1px solid #66666e;border-radius:14px;padding:32px;background:#000000">
      <p style="margin:0 0 24px;color:#9999a1;letter-spacing:4px;font-size:12px;font-weight:bold;text-transform:uppercase">Barbearia</p>
      <h1 style="margin:0 0 16px;color:#e6e6e9;font-size:22px">${esc(title)}</h1>
      <p style="margin:0 0 8px;color:#e6e6e9;font-size:16px;line-height:1.5">Olá, ${esc(name)}!</p>
      <p style="margin:0 0 24px;color:#e6e6e9;font-size:16px;line-height:1.5">${esc(message)}</p>
      <p style="margin:0;color:#66666e;font-size:12px">Precisa alterar? Acesse o sistema e remarque ou cancele com pelo menos 2h de antecedência.</p>
    </div>
  </div>`;
}

// Nunca lança erro: devolve true/false. Assim uma falha de e-mail não derruba o agendamento.
async function sendMail({ to, name, subject, message }) {
  if (!transporter) {
    console.log(`[E-MAIL (simulado) → ${name} <${to}>] ${subject}: ${message}`);
    return true;
  }
  try {
    await transporter.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to,
      subject,
      text: `Olá, ${name}!\n\n${message}`,          // versão texto puro (fallback)
      html: template(name, subject, message),
    });
    return true;
  } catch (e) {
    console.error(`✉️  Falha ao enviar para ${to}:`, e.message);
    return false;
  }
}

module.exports = { sendMail };