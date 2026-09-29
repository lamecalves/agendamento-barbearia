const Database = require('better-sqlite3');
const db = new Database('barbearia.db');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client' CHECK(role IN('client','barber'))
);
CREATE TABLE IF NOT EXISTS services(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, duration_min INTEGER NOT NULL,
  price_cents INTEGER NOT NULL, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS appointments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES users(id),
  barber_id  INTEGER NOT NULL REFERENCES users(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK(status IN('confirmed','cancelled','done','no_show')),
  reminder_24h INTEGER DEFAULT 0, reminder_1h INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_app_barber ON appointments(barber_id, start_at);
`);
module.exports = db;