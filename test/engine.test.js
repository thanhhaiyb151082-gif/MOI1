'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config');
const { loadQuestions } = require('../src/questions');
const { createGame, sanitizeName } = require('../src/gameEngine');
const { rankPlayers, findChampions } = require('../src/ranking');

// ---------- đồng hồ giả + bộ thu sự kiện ----------
function fakeClock() {
  let t = 1000;
  const epoch0 = 1_700_000_000_000;
  const timers = [];
  return {
    nowMono: () => t,
    nowEpoch: () => epoch0 + t,
    setTimeout(fn, ms) {
      const h = { at: t + ms, fn, cancelled: false, done: false };
      timers.push(h);
      return h;
    },
    clearTimeout(h) {
      if (h) h.cancelled = true;
    },
    advance(ms) {
      const target = t + ms;
      for (;;) {
        const due = timers
          .filter((h) => !h.cancelled && !h.done && h.at <= target)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        t = due.at;
        due.done = true;
        due.fn();
      }
      t = target;
    },
  };
}

function setup(overrides = {}) {
  const clock = fakeClock();
  const events = [];
  const out = {
    all: (e, d) => events.push({ to: 'all', e, d }),
    room: (r, e, d) => events.push({ to: r, e, d }),
    player: (id, e, d) => events.push({ to: 'p:' + id, e, d }),
  };
  const questions = loadQuestions();
  const cfg = { ...config, ...overrides };
  const game = createGame({ questions, config: cfg, clock, out });
  const last = (name) => [...events].reverse().find((x) => x.e === name);
  return { clock, events, game, questions, cfg, last };
}

const addPlayers = (game, ...names) => names.map((n) => game.join({ name: n }).playerId);

// ---------- cấu hình & dữ liệu ----------
test('luật chơi chính thức và bộ câu hỏi khớp nhau', () => {
  const qs = loadQuestions();
  assert.equal(qs.length, 10);
  assert.equal(config.QUESTION_COUNT, 10);
  assert.equal(config.DURATION_MS, 20000);
  assert.equal(config.POINTS_CORRECT, 10);
  assert.equal(config.POINTS_WRONG, 0);
});

test('question:start không lộ đáp án đúng', () => {
  const { game, last } = setup();
  addPlayers(game, 'An');
  game.start();
  const payload = last('question:start').d;
  assert.equal(payload.answer, undefined);
  assert.equal(payload.explanation, undefined);
  assert.equal(payload.durationMs, 20000);
  assert.equal(payload.options.length, 4);
});

// ---------- ghi nhận thời gian ----------
test('thời gian trả lời tính bằng mili-giây theo đồng hồ server', () => {
  const { game, clock, questions } = setup();
  const [a] = addPlayers(game, 'An');
  game.start();
  clock.advance(1234.4);
  const res = game.submitAnswer(a, 0, questions[0].answer);
  assert.deepEqual(res, { ok: true, timeMs: 1234 });
});

test('dùng mốc thời gian nhận gói tin thay vì lúc xử lý', () => {
  const { game, clock, questions } = setup();
  const [a] = addPlayers(game, 'An');
  game.start();
  const receivedAt = clock.nowMono() + 2000; // gói tin đến lúc 2000 ms
  clock.advance(500); // xử lý trễ thêm 500 ms không được tính
  const res = game.submitAnswer(a, 0, 1, receivedAt);
  assert.equal(res.timeMs, 2000);
});

test('chỉ nhận lần trả lời đầu tiên', () => {
  const { game, clock, questions } = setup();
  const [a] = addPlayers(game, 'An');
  game.start();
  clock.advance(1000);
  assert.equal(game.submitAnswer(a, 0, questions[0].answer).ok, true);
  clock.advance(500);
  assert.deepEqual(game.submitAnswer(a, 0, 0), { ok: false, reason: 'already_answered' });
});

test('từ chối đáp án sai câu, sai chỉ số, sai pha, người lạ', () => {
  const { game, clock } = setup();
  const [a] = addPlayers(game, 'An');
  assert.equal(game.submitAnswer(a, 0, 1).reason, 'not_accepting'); // chưa bắt đầu
  game.start();
  assert.equal(game.submitAnswer(a, 1, 1).reason, 'wrong_question');
  assert.equal(game.submitAnswer(a, 0, 4).reason, 'invalid_choice');
  assert.equal(game.submitAnswer(a, 0, -1).reason, 'invalid_choice');
  assert.equal(game.submitAnswer(a, 0, '1').reason, 'invalid_choice');
  assert.equal(game.submitAnswer('khong-co', 0, 1).reason, 'unknown_player');
  clock.advance(config.DURATION_MS + config.GRACE_MS + 1);
  assert.equal(game.submitAnswer(a, 0, 1).reason, 'not_accepting'); // đã chốt
});

test('đáp án trong thời gian châm chước vẫn nhận, thời gian bị chặn ở 20000 ms', () => {
  const { game, clock, questions } = setup();
  const [a, b] = addPlayers(game, 'An', 'Binh');
  game.start();
  clock.advance(20000 + 200);
  const res = game.submitAnswer(a, 0, questions[0].answer);
  assert.deepEqual(res, { ok: true, timeMs: 20000 });
  // Đến đúng sau hạn châm chước: từ chối
  const late = game.submitAnswer(b, 0, questions[0].answer, clock.nowMono() + 200);
  assert.equal(late.reason, 'too_late');
});

test('hết giờ server tự chốt câu (không cần MC)', () => {
  const { game, clock, last } = setup();
  addPlayers(game, 'An');
  game.start();
  clock.advance(config.DURATION_MS + config.GRACE_MS);
  assert.equal(game._game.phase, 'reveal');
  assert.ok(last('question:reveal'));
});

// ---------- chấm điểm ----------
test('đúng +10, sai +0, bỏ qua +0, không ai bị loại', () => {
  const { game, clock, questions, last } = setup();
  const [an, binh, chi] = addPlayers(game, 'An', 'Bình', 'Chi');
  const right = questions[0].answer;
  const wrong = (right + 1) % 4;

  game.start();
  clock.advance(3000);
  game.submitAnswer(an, 0, right);
  game.submitAnswer(binh, 0, wrong);
  // Chi bỏ qua
  clock.advance(config.DURATION_MS);

  const p = game._players;
  assert.equal(p.get(an).score, 10);
  assert.equal(p.get(binh).score, 0);
  assert.equal(p.get(chi).score, 0);
  assert.equal(p.size, 3); // không ai bị loại

  const reveal = last('question:reveal').d;
  assert.equal(reveal.correct, right);
  assert.equal(reveal.correctCount, 1);
  assert.equal(reveal.answeredCount, 2);
  assert.deepEqual(reveal.counts.reduce((x, y) => x + y, 0), 2);
});

test('thời gian chỉ cộng cho câu trả lời đúng', () => {
  const { game, clock, questions } = setup();
  const [an] = addPlayers(game, 'An');

  // Câu 1: đúng sau 4000 ms
  game.start();
  clock.advance(4000);
  game.submitAnswer(an, 0, questions[0].answer);
  game.closeQuestion();
  // Câu 2: sai sau 1000 ms
  game.next();
  clock.advance(1000);
  game.submitAnswer(an, 1, (questions[1].answer + 1) % 4);
  game.closeQuestion();

  const p = game._players.get(an);
  assert.equal(p.score, 10);
  assert.equal(p.totalTimeMs, 4000);
  assert.equal(p.correctCount, 1);
});

test('người chơi nhận kết quả riêng sau mỗi câu', () => {
  const { game, clock, questions, events } = setup();
  const [an] = addPlayers(game, 'An');
  game.start();
  clock.advance(2500);
  game.submitAnswer(an, 0, questions[0].answer);
  game.closeQuestion();
  const mine = events.find((x) => x.to === 'p:' + an && x.e === 'player:result').d;
  assert.equal(mine.correct, true);
  assert.equal(mine.gained, 10);
  assert.equal(mine.timeMs, 2500);
  assert.equal(mine.rank, 1);
});

// ---------- xếp hạng ----------
test('xếp hạng: điểm rồi thời gian; bằng cả hai thì đồng hạng (1,1,3)', () => {
  const ranked = rankPlayers([
    { id: 'a', name: 'A', score: 50, totalTimeMs: 9000, correctCount: 5 },
    { id: 'b', name: 'B', score: 50, totalTimeMs: 9000, correctCount: 5 },
    { id: 'c', name: 'C', score: 50, totalTimeMs: 12000, correctCount: 5 },
    { id: 'd', name: 'D', score: 40, totalTimeMs: 100, correctCount: 4 },
    { id: 'e', name: 'E', score: 60, totalTimeMs: 99999, correctCount: 6 },
  ]);
  assert.deepEqual(
    ranked.map((r) => [r.name, r.rank]),
    [['E', 1], ['A', 2], ['B', 2], ['C', 4], ['D', 5]]
  );
});

test('điểm cao hơn luôn thắng dù chậm hơn; cùng điểm thì nhanh hơn thắng', () => {
  const ranked = rankPlayers([
    { id: 'a', name: 'A', score: 30, totalTimeMs: 1000, correctCount: 3 },
    { id: 'b', name: 'B', score: 40, totalTimeMs: 99000, correctCount: 4 },
    { id: 'c', name: 'C', score: 30, totalTimeMs: 500, correctCount: 3 },
  ]);
  assert.deepEqual(ranked.map((r) => r.name), ['B', 'C', 'A']);
});

test('Quán quân: nhiều người đồng hạng 1 đều là Quán quân; không ai có điểm thì chưa có', () => {
  const tie = rankPlayers([
    { id: 'a', name: 'A', score: 100, totalTimeMs: 7000, correctCount: 10 },
    { id: 'b', name: 'B', score: 100, totalTimeMs: 7000, correctCount: 10 },
    { id: 'c', name: 'C', score: 90, totalTimeMs: 1, correctCount: 9 },
  ]);
  assert.deepEqual(findChampions(tie).map((r) => r.name).sort(), ['A', 'B']);

  const zero = rankPlayers([{ id: 'x', name: 'X', score: 0, totalTimeMs: 0, correctCount: 0 }]);
  assert.deepEqual(findChampions(zero), []);
});

// ---------- cả ván chơi ----------
test('chơi trọn 10 câu: tổng điểm, xếp hạng và Quán quân đúng', () => {
  const { game, clock, questions, last } = setup();
  const [an, binh, chi] = addPlayers(game, 'An', 'Bình', 'Chi');

  game.start();
  for (let i = 0; i < 10; i++) {
    const right = questions[i].answer;
    const wrong = (right + 1) % questions[i].options.length;
    clock.advance(1000);
    game.submitAnswer(an, i, right); // An luôn đúng, 1000 ms
    clock.advance(500);
    game.submitAnswer(binh, i, right); // Bình luôn đúng, 1500 ms
    game.submitAnswer(chi, i, i < 5 ? right : wrong); // Chi đúng 5 câu đầu, 1500 ms
    game.closeQuestion();
    if (i < 9) assert.equal(game.next().ok, true);
  }
  assert.equal(game.next().ok, true); // câu cuối -> kết thúc
  assert.equal(game._game.phase, 'finished');

  const p = game._players;
  assert.equal(p.get(an).score, 100);
  assert.equal(p.get(an).totalTimeMs, 10 * 1000);
  assert.equal(p.get(binh).score, 100);
  assert.equal(p.get(binh).totalTimeMs, 10 * 1500);
  assert.equal(p.get(chi).score, 50);

  const done = last('game:finished').d;
  assert.deepEqual(done.champions.map((c) => c.name), ['An']);
  assert.deepEqual(done.top.map((r) => [r.name, r.rank]), [['An', 1], ['Bình', 2], ['Chi', 3]]);
  assert.equal(p.size, 3); // không ai bị loại suốt ván
});

test('phản hồi đúng pha: không next khi đang hỏi, không start hai lần', () => {
  const { game } = setup();
  addPlayers(game, 'An');
  assert.equal(game.next().reason, 'wrong_phase');
  assert.equal(game.start().ok, true);
  assert.equal(game.start().reason, 'wrong_phase');
  assert.equal(game.next().reason, 'wrong_phase'); // đang ở pha question
  assert.equal(game.closeQuestion().ok, true);
  assert.equal(game.closeQuestion().reason, 'wrong_phase');
});

test('reset giữ người chơi nhưng xoá điểm; wipePlayers xoá hết', () => {
  const { game, clock, questions } = setup();
  const [an] = addPlayers(game, 'An');
  game.start();
  clock.advance(1000);
  game.submitAnswer(an, 0, questions[0].answer);
  game.closeQuestion();
  game.reset();
  assert.equal(game._game.phase, 'lobby');
  assert.equal(game._players.get(an).score, 0);
  game.reset({ wipePlayers: true });
  assert.equal(game._players.size, 0);
});

// ---------- người chơi ----------
test('tên: làm sạch, chống trùng, chống tên rỗng; vào lại bằng playerId giữ điểm', () => {
  assert.equal(sanitizeName('  <b>Nguyễn   Văn A</b> ', 24), 'bNguyễn Văn A/b');
  const { game } = setup();
  const a1 = game.join({ name: 'An' });
  const a2 = game.join({ name: 'an' });
  assert.equal(a1.name, 'An');
  assert.equal(a2.name, 'an (2)');
  assert.equal(game.join({ name: '   ' }).reason, 'invalid_name');

  game.setConnected(a1.playerId, false);
  const back = game.join({ playerId: a1.playerId });
  assert.equal(back.resumed, true);
  assert.equal(back.name, 'An');
});

test('getState cho người vào lại giữa câu có thời gian còn lại', () => {
  const { game, clock } = setup();
  const [an] = addPlayers(game, 'An');
  game.start();
  clock.advance(7000);
  const s = game.getState(an);
  assert.equal(s.phase, 'question');
  assert.equal(s.question.remainingMs, 13000);
  assert.equal(s.question.answer, undefined);
  assert.equal(s.myAnswered, false);
});

// ---------- snapshot ----------
test('serialize/restore giữ điểm và đưa game về pha reveal', () => {
  const a = setup();
  const [an] = addPlayers(a.game, 'An');
  a.game.start();
  a.clock.advance(1500);
  a.game.submitAnswer(an, 0, a.questions[0].answer);
  a.game.closeQuestion();
  const snap = JSON.parse(JSON.stringify(a.game.serialize()));

  const b = setup();
  assert.equal(b.game.restore(snap), true);
  assert.equal(b.game._game.phase, 'reveal');
  assert.equal(b.game._players.get(an).score, 10);
  assert.equal(b.game._players.get(an).totalTimeMs, 1500);
  assert.equal(b.game.next().ok, true); // MC bấm tiếp được
});

test('getState ở pha reveal có nội dung câu hỏi để trang vào lại vẫn hiển thị được', () => {
  const { game, clock, questions } = setup();
  const [an] = addPlayers(game, 'An');
  game.start();
  clock.advance(2000);
  game.submitAnswer(an, 0, questions[0].answer);
  game.closeQuestion();
  const s = game.getState(an);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.question.text, questions[0].text);
  assert.equal(s.question.answer, undefined); // vẫn không có trường answer trong câu hỏi công khai
  assert.equal(s.lastReveal.correct, questions[0].answer);
  assert.equal(s.myResult.correct, true);
});
