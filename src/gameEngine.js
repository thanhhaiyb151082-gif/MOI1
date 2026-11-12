'use strict';

const crypto = require('node:crypto');
const { scoreAnswer } = require('./scoring');
const { rankPlayers, findChampions } = require('./ranking');

function sanitizeName(raw, maxLen) {
  return String(raw == null ? '' : raw)
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .trim();
}

/**
 * Lõi game, không phụ thuộc Socket.IO để dễ kiểm thử.
 *
 * Máy trạng thái:
 *   lobby --start--> question --(hết giờ | admin chốt)--> reveal --next--> question ... --next(câu cuối)--> finished
 *   reset đưa về lobby ở mọi phase.
 *
 * @param questions  mảng câu hỏi đã kiểm tra
 * @param config     xem src/config.js
 * @param clock      { nowMono, nowEpoch, setTimeout, clearTimeout }
 * @param out        { all(event, data), room(name, event, data), player(id, event, data) }
 * @param hooks      { persist() } (tuỳ chọn) gọi khi cần lưu snapshot
 */
function createGame({ questions, config, clock, out, hooks = {} }) {
  const players = new Map();
  const game = {
    phase: 'lobby',
    qIndex: -1,
    startedAtMono: 0,
    startedAtEpoch: 0,
    timer: null,
    answered: 0,
    ranking: [],
    rankMap: new Map(),
    lastReveal: null,
  };

  const ok = (extra) => Object.assign({ ok: true }, extra);
  const fail = (reason) => ({ ok: false, reason });
  const persist = () => {
    try {
      if (hooks.persist) hooks.persist();
    } catch (_) {
      /* lưu snapshot là cố gắng tối đa, không làm hỏng game */
    }
  };

  // ---------- tiện ích ----------
  function refreshRanking() {
    game.ranking = rankPlayers([...players.values()]);
    game.rankMap = new Map(game.ranking.map((r) => [r.id, r]));
  }

  function topRows() {
    return game.ranking
      .filter((r) => r.rank <= config.TOP_N)
      .slice(0, config.TOP_MAX_ROWS)
      .map(({ rank, name, score, totalTimeMs }) => ({ rank, name, score, totalTimeMs }));
  }

  function publicQuestion(i) {
    const q = questions[i];
    // KHÔNG đưa "answer" và "explanation" vào đây: chỉ lộ sau khi hết giờ.
    return {
      qIndex: i,
      total: questions.length,
      text: q.text,
      options: q.options,
      image: q.image || null,
      durationMs: config.DURATION_MS,
    };
  }

  function counts() {
    let connected = 0;
    for (const p of players.values()) if (p.connected) connected++;
    return {
      phase: game.phase,
      qIndex: game.qIndex,
      players: players.size,
      connected,
      answered: game.answered,
    };
  }

  function broadcastCounts() {
    const c = counts();
    out.room('admin', 'room:count', c);
    out.room('screen', 'room:count', c);
  }

  function myResult(p) {
    const r = game.rankMap.get(p.id);
    const last = p.history[p.history.length - 1];
    return {
      qIndex: game.qIndex,
      choice: last && last.qIndex === game.qIndex ? last.choice : null,
      correct: last && last.qIndex === game.qIndex ? last.correct : false,
      gained: last && last.qIndex === game.qIndex ? last.gained : 0,
      timeMs: last && last.qIndex === game.qIndex ? last.timeMs : null,
      score: p.score,
      totalTimeMs: p.totalTimeMs,
      rank: r ? r.rank : null,
      totalPlayers: players.size,
    };
  }

  // ---------- người chơi ----------
  function uniqueName(base) {
    const taken = new Set([...players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  function join({ playerId, name } = {}) {
    // Vào lại sau khi rớt mạng: dùng playerId (mã bí mật lưu ở máy người chơi)
    if (typeof playerId === 'string' && players.has(playerId)) {
      const p = players.get(playerId);
      p.connected = true;
      broadcastCounts();
      return ok({ playerId: p.id, name: p.name, resumed: true });
    }
    const clean = sanitizeName(name, config.MAX_NAME_LEN);
    if (!clean) return fail('invalid_name');
    if (players.size >= config.MAX_PLAYERS) return fail('room_full');

    const p = {
      id: crypto.randomUUID(),
      name: uniqueName(clean),
      connected: true,
      score: 0,
      totalTimeMs: 0,
      correctCount: 0,
      answer: null,
      history: [],
    };
    players.set(p.id, p);
    refreshRanking();
    broadcastCounts();
    persist();
    return ok({ playerId: p.id, name: p.name, resumed: false });
  }

  function setConnected(playerId, connected) {
    const p = players.get(playerId);
    if (!p) return;
    p.connected = connected;
    broadcastCounts();
  }

  // ---------- nhận đáp án ----------
  /**
   * @param receivedAtMono  mốc thời gian (clock.nowMono) lấy NGAY khi gói tin đến handler.
   *                        Nếu bỏ trống, dùng thời điểm hàm này được gọi.
   */
  function submitAnswer(playerId, qIndex, choice, receivedAtMono) {
    const received = typeof receivedAtMono === 'number' ? receivedAtMono : clock.nowMono();

    const p = players.get(playerId);
    if (!p) return fail('unknown_player');
    if (game.phase !== 'question') return fail('not_accepting');
    if (qIndex !== game.qIndex) return fail('wrong_question');
    const q = questions[game.qIndex];
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) {
      return fail('invalid_choice');
    }
    if (p.answer) return fail('already_answered'); // chỉ nhận lần chọn ĐẦU TIÊN

    // Thời gian trả lời do SERVER tính, không tin đồng hồ của điện thoại.
    const elapsed = received - game.startedAtMono;
    if (elapsed > config.DURATION_MS + config.GRACE_MS) return fail('too_late');

    const timeMs = Math.min(config.DURATION_MS, Math.max(0, Math.round(elapsed)));
    p.answer = { choice, timeMs };
    game.answered++;
    broadcastCounts();
    // Chỉ xác nhận "đã nhận", không nói đúng/sai trước khi hết giờ.
    return ok({ timeMs });
  }

  // ---------- điều khiển của MC ----------
  function startQuestion(i) {
    for (const p of players.values()) p.answer = null;
    game.answered = 0;
    game.phase = 'question';
    game.qIndex = i;

    // Đặt mốc thời gian ngay trước khi phát câu hỏi.
    game.startedAtMono = clock.nowMono();
    game.startedAtEpoch = clock.nowEpoch();
    game.timer = clock.setTimeout(() => closeQuestion(), config.DURATION_MS + config.GRACE_MS);

    out.all('question:start', {
      ...publicQuestion(i),
      startedAt: game.startedAtEpoch,
      endsAt: game.startedAtEpoch + config.DURATION_MS,
      serverNow: game.startedAtEpoch,
    });
    broadcastCounts();
  }

  function start() {
    if (game.phase !== 'lobby') return fail('wrong_phase');
    startQuestion(0);
    return ok();
  }

  /** Hết giờ (tự động) hoặc MC chốt sớm: chấm điểm tất cả, KHÔNG loại ai. */
  function closeQuestion() {
    if (game.phase !== 'question') return fail('wrong_phase');
    clock.clearTimeout(game.timer);
    game.timer = null;

    const q = questions[game.qIndex];
    const optionCounts = new Array(q.options.length).fill(0);
    let correctCount = 0;

    for (const p of players.values()) {
      const r = scoreAnswer(q, p.answer, config);
      if (p.answer) optionCounts[p.answer.choice]++;
      p.score += r.gained;
      if (r.correct) {
        p.totalTimeMs += r.timeMs; // chỉ cộng thời gian của câu TRẢ LỜI ĐÚNG
        p.correctCount++;
        correctCount++;
      }
      p.history.push({
        qIndex: game.qIndex,
        choice: p.answer ? p.answer.choice : null,
        correct: r.correct,
        gained: r.gained,
        timeMs: p.answer ? p.answer.timeMs : null,
      });
      p.answer = null;
    }

    game.phase = 'reveal';
    refreshRanking();

    game.lastReveal = {
      qIndex: game.qIndex,
      total: questions.length,
      correct: q.answer,
      explanation: q.explanation || '',
      counts: optionCounts,
      correctCount,
      answeredCount: game.answered,
      isLast: game.qIndex === questions.length - 1,
      top: topRows(),
    };
    out.all('question:reveal', game.lastReveal);
    for (const p of players.values()) out.player(p.id, 'player:result', myResult(p));
    broadcastCounts();
    persist();
    return ok();
  }

  function finish() {
    game.phase = 'finished';
    refreshRanking();
    const champions = findChampions(game.ranking).map(({ name, score, totalTimeMs }) => ({
      name,
      score,
      totalTimeMs,
    }));
    const championIds = new Set(findChampions(game.ranking).map((r) => r.id));
    out.all('game:finished', { champions, top: topRows(), totalPlayers: players.size });
    for (const p of players.values()) {
      out.player(p.id, 'player:final', {
        ...myResult(p),
        isChampion: championIds.has(p.id),
      });
    }
    broadcastCounts();
    persist();
  }

  function next() {
    if (game.phase !== 'reveal') return fail('wrong_phase');
    if (game.qIndex + 1 >= questions.length) {
      finish();
    } else {
      startQuestion(game.qIndex + 1);
    }
    return ok();
  }

  function reset({ wipePlayers = false } = {}) {
    clock.clearTimeout(game.timer);
    game.timer = null;
    game.phase = 'lobby';
    game.qIndex = -1;
    game.answered = 0;
    game.lastReveal = null;
    if (wipePlayers) {
      players.clear();
    } else {
      for (const p of players.values()) {
        p.score = 0;
        p.totalTimeMs = 0;
        p.correctCount = 0;
        p.answer = null;
        p.history = [];
      }
    }
    refreshRanking();
    out.all('game:reset', { wipePlayers });
    broadcastCounts();
    persist();
    return ok();
  }

  // ---------- trạng thái cho client vào lại / màn chiếu ----------
  function getState(playerId) {
    const me = typeof playerId === 'string' ? players.get(playerId) : null;
    const state = {
      phase: game.phase,
      qIndex: game.qIndex,
      total: questions.length,
      serverNow: clock.nowEpoch(),
      counts: counts(),
    };
    if (game.phase === 'question') {
      const elapsed = clock.nowMono() - game.startedAtMono;
      state.question = {
        ...publicQuestion(game.qIndex),
        startedAt: game.startedAtEpoch,
        endsAt: game.startedAtEpoch + config.DURATION_MS,
        remainingMs: Math.max(0, Math.round(config.DURATION_MS - elapsed)),
      };
      if (me) state.myAnswered = !!me.answer;
    } else if (game.phase === 'reveal' || game.phase === 'finished') {
      state.lastReveal = game.lastReveal;
      state.top = topRows();
      // Để trang vào lại giữa chừng vẫn hiện được nội dung câu vừa công bố
      if (game.phase === 'reveal' && game.qIndex >= 0) state.question = publicQuestion(game.qIndex);
    }
    if (me) {
      state.me = {
        name: me.name,
        score: me.score,
        totalTimeMs: me.totalTimeMs,
        rank: game.rankMap.has(me.id) ? game.rankMap.get(me.id).rank : null,
      };
      if (game.phase === 'reveal') state.myResult = myResult(me);
    }
    return state;
  }

  // ---------- lưu / khôi phục (phòng khi tiến trình khởi động lại) ----------
  function serialize() {
    return {
      savedAt: clock.nowEpoch(),
      phase: game.phase,
      qIndex: game.qIndex,
      players: [...players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        totalTimeMs: p.totalTimeMs,
        correctCount: p.correctCount,
        history: p.history,
      })),
    };
  }

  /**
   * Khôi phục người chơi + điểm. Câu đang dở lúc sập KHÔNG được khôi phục:
   * game quay về trạng thái "reveal" của câu đó để MC bấm "Câu tiếp theo".
   */
  function restore(data) {
    if (!data || !Array.isArray(data.players)) return false;
    players.clear();
    for (const p of data.players) {
      players.set(p.id, {
        id: p.id,
        name: p.name,
        connected: false,
        score: p.score || 0,
        totalTimeMs: p.totalTimeMs || 0,
        correctCount: p.correctCount || 0,
        answer: null,
        history: Array.isArray(p.history) ? p.history : [],
      });
    }
    game.qIndex = Number.isInteger(data.qIndex) ? data.qIndex : -1;
    game.phase = data.phase === 'finished' ? 'finished' : game.qIndex >= 0 ? 'reveal' : 'lobby';
    game.lastReveal = null;
    refreshRanking();
    return true;
  }

  return {
    join,
    setConnected,
    submitAnswer,
    start,
    closeQuestion,
    next,
    reset,
    getState,
    serialize,
    restore,
    // chỉ để kiểm thử
    _game: game,
    _players: players,
  };
}

module.exports = { createGame, sanitizeName };
