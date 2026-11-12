'use strict';

/**
 * Chấm một câu trả lời (hàm thuần, không đụng đến trạng thái).
 *
 * @param question  { answer: <chỉ số đáp án đúng> }
 * @param answer    { choice, timeMs } hoặc null nếu người chơi bỏ qua
 * @param cfg       { POINTS_CORRECT, POINTS_WRONG }
 * @returns { correct, gained, timeMs }
 *   - đúng:            gained = POINTS_CORRECT (+10), timeMs được tính vào tổng thời gian
 *   - sai / bỏ qua:    gained = POINTS_WRONG   (+0),  KHÔNG cộng thời gian
 */
function scoreAnswer(question, answer, cfg) {
  if (!answer) return { correct: false, gained: cfg.POINTS_WRONG, timeMs: null };
  const correct = answer.choice === question.answer;
  return {
    correct,
    gained: correct ? cfg.POINTS_CORRECT : cfg.POINTS_WRONG,
    timeMs: answer.timeMs,
  };
}

module.exports = { scoreAnswer };
