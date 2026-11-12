'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');

const config = require('./src/config');
const clock = require('./src/clock');
const { loadQuestions } = require('./src/questions');
const { createGame } = require('./src/gameEngine');
const { attachSocket } = require('./src/socket');

const questions = loadQuestions();
if (questions.length !== config.QUESTION_COUNT) {
  console.warn(
    `[cảnh báo] questions.json có ${questions.length} câu, luật chơi chính thức là ${config.QUESTION_COUNT} câu.`
  );
}
if (!config.ADMIN_PASSWORD) {
  console.warn('[cảnh báo] Chưa đặt ADMIN_PASSWORD: không ai đăng nhập MC được.');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Điện thoại hay đổi mạng: cho phép khôi phục kết nối ngắn mà không mất phòng.
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  pingInterval: 10000,
  pingTimeout: 10000,
});

const out = {
  all: (event, data) => io.emit(event, data),
  room: (room, event, data) => io.to(room).emit(event, data),
  player: (id, event, data) => io.to('p:' + id).emit(event, data),
};

// Lưu snapshot (gộp nhiều lần gọi trong 1 giây thành 1 lần ghi)
const snapshotPath = path.resolve(config.SNAPSHOT_FILE);
let saveTimer = null;
const hooks = {
  persist() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      fs.writeFile(snapshotPath, JSON.stringify(engine.serialize()), () => {});
    }, 1000);
  },
};

const engine = createGame({ questions, config, clock, out, hooks });

try {
  if (fs.existsSync(snapshotPath) && engine.restore(JSON.parse(fs.readFileSync(snapshotPath, 'utf8')))) {
    console.log('Đã khôi phục người chơi và điểm từ snapshot.');
  }
} catch (e) {
  console.warn('Không đọc được snapshot, bắt đầu mới:', e.message);
}

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public')));

attachSocket(io, engine, { config, clock });

server.listen(config.PORT, () => console.log('Game chạy tại cổng ' + config.PORT));
