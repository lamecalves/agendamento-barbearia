require('dotenv').config();const express = require('express');
const { router: authRouter } = require('./auth');
const { startReminders } = require('./reminders');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/api/auth', authRouter);
app.use('/api', require('./routes'));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Erro interno' }); });

startReminders();
app.listen(3000, () => console.log('http://localhost:3000'));