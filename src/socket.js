'use strict';

const crypto = require('node:crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Gắn các sự kiện Socket.IO vào engine.
 *
 * Phòng (room): 'players', 'screen', 'admin', và 'p:<playerId>' cho từng người chơi
 * (nhiều tab / vào lại cùng một người vẫn nhận đúng tin riêng).
 */
function attachSocket(io, engine, { config, clock }) {
  io.on('connection', (socket) => {
    const reply = (ack, payload) => {
      if (typeof ack === 'function') ack(payload);
    };
    socket.data.failedLogins = 0;

    // ----- màn chiếu -----
    socket.on('screen:join', (_data, ack) => {
      socket.join('screen');
      reply(ack, { ok: true, state: engine.getState() });
    });

    // ----- người chơi -----
    socket.on('player:join', (data, ack) => {
      const res = engine.join(data || {});
      if (!res.ok) return reply(ack, res);
      socket.data.playerId = res.playerId;
      socket.join('players');
      socket.join('p:' + res.playerId);
      engine.setConnected(res.playerId, true);
      reply(ack, { ...res, state: engine.getState(res.playerId) });
    });

    socket.on('player:answer', (data, ack) => {
      // Lấy mốc thời gian NGAY ở dòng đầu để loại trừ độ trễ xử lý phía server.
      const receivedAt = clock.nowMono();
      const playerId = socket.data.playerId;
      if (!playerId) return reply(ack, { ok: false, reason: 'not_joined' });
      const d = data || {};
      reply(ack, engine.submitAnswer(playerId, d.qIndex, d.choice, receivedAt));
    });

    // ----- MC / quản trị -----
    socket.on('admin:login', (data, ack) => {
      if (!config.ADMIN_PASSWORD) return reply(ack, { ok: false, reason: 'admin_disabled' });
      if (socket.data.failedLogins >= 5) return reply(ack, { ok: false, reason: 'locked' });
      const pass = data && typeof data.password === 'string' ? data.password : '';
      if (safeEqual(pass, config.ADMIN_PASSWORD)) {
        socket.data.isAdmin = true;
        socket.join('admin');
        socket.join('screen'); // MC cũng nhận dữ liệu như màn chiếu
        return reply(ack, { ok: true, state: engine.getState() });
      }
      socket.data.failedLogins++;
      reply(ack, { ok: false, reason: 'bad_password' });
    });

    const adminOnly = (handler) => (data, ack) => {
      if (!socket.data.isAdmin) return reply(ack, { ok: false, reason: 'forbidden' });
      reply(ack, handler(data || {}));
    };
    socket.on('admin:start', adminOnly(() => engine.start()));
    socket.on('admin:lock', adminOnly(() => engine.closeQuestion())); // chốt sớm câu đang hỏi
    socket.on('admin:next', adminOnly(() => engine.next()));
    socket.on('admin:reset', adminOnly((d) => engine.reset({ wipePlayers: !!d.wipePlayers })));

    socket.on('disconnect', () => {
      const id = socket.data.playerId;
      if (!id) return;
      const room = io.sockets.adapter.rooms.get('p:' + id);
      if (!room || room.size === 0) engine.setConnected(id, false);
    });
  });
}

module.exports = { attachSocket };
