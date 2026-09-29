const db = require('./db'), bcrypt = require('bcryptjs');
db.prepare("INSERT OR IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,'barber')")
  .run('Barbeiro Chefe', 'barbeiro@casa.com', bcrypt.hashSync('123456', 10));
if (!db.prepare('SELECT 1 FROM services').get()) {
  const ins = db.prepare('INSERT INTO services(name,duration_min,price_cents) VALUES(?,?,?)');
  ins.run('Corte', 30, 4500); ins.run('Barba', 30, 3500); ins.run('Corte + Barba', 60, 7500);
}
console.log('Seed ok');