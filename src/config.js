'use strict';

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

// LUẬT CHƠI CHÍNH THỨC (chốt cứng trong mã, không đọc từ client)
module.exports = {
  PORT: num(process.env.PORT, 3000),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',

  QUESTION_COUNT: 10,      // 10 câu hỏi
  DURATION_MS: 20000,      // 20 giây / câu
  POINTS_CORRECT: 10,      // đúng +10
  POINTS_WRONG: 0,         // sai hoặc bỏ qua +0
  // Không loại người chơi nào: không có logic loại trong engine.

  // Châm chước độ trễ mạng: câu trả lời đến server trong khoảng này sau
  // 20 giây vẫn được nhận (thời gian được ghi tối đa 20000 ms).
  GRACE_MS: num(process.env.GRACE_MS, 300),

  MAX_NAME_LEN: 24,
  MAX_PLAYERS: 1000,
  TOP_N: 10,               // số hạng hiển thị trên bảng xếp hạng
  TOP_MAX_ROWS: 30,        // trần số dòng gửi đi (phòng khi đồng hạng rất đông)
  SNAPSHOT_FILE: process.env.SNAPSHOT_FILE || 'snapshot.json',
};
