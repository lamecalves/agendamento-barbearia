const router = require('express').Router();
const jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs'), db = require('./db');
const SECRET = process.env.JWT_SECRET || 'dev-secret-troque-em-producao';
const sign = u => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: '7d' });

router.post('/register', (req, res) => {
  const { name, phone, password } = req.body;
  const email = (req.body.email || '').toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || (password || '').length < 6)
    return res.status(400).json({ error: 'Informe nome, e-mail válido e senha (mín. 6 caracteres)' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email))
    return res.status(409).json({ error: 'E-mail já cadastrado' });
  const r = db.prepare("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,'client')")
    .run(name, email, phone || null, bcrypt.hashSync(password, 10));
  const user = { id: r.lastInsertRowid, role: 'client', name };
  res.status(201).json({ token: sign(user), user });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash))
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  const user = { id: u.id, role: u.role, name: u.name };
  res.json({ token: sign(user), user });
});

function auth(req, res, next) {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next(); }
  catch { res.status(401).json({ error: 'Não autenticado' }); }
}
const only = role => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: 'Sem permissão' });

module.exports = { router, auth, only };