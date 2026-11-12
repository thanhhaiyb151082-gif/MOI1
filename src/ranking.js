'use strict';

/**
 * Xếp hạng (hàm thuần):
 *   1) tổng điểm giảm dần
 *   2) nếu bằng điểm: tổng thời gian trả lời ĐÚNG (ms) tăng dần (nhanh hơn xếp trên)
 *   3) bằng cả điểm lẫn thời gian: CÙNG thứ hạng, hạng kế tiếp được bỏ qua (1, 1, 3, ...)
 *
 * Thứ tự phụ theo tên chỉ để danh sách hiển thị ổn định, KHÔNG ảnh hưởng thứ hạng.
 */
function rankPlayers(list) {
  const sorted = [...list].sort(
    (a, b) =>
      b.score - a.score ||
      a.totalTimeMs - b.totalTimeMs ||
      String(a.name).localeCompare(String(b.name), 'vi')
  );

  let rank = 0;
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    if (i === 0 || p.score !== prev.score || p.totalTimeMs !== prev.totalTimeMs) {
      rank = i + 1;
    }
    return {
      id: p.id,
      name: p.name,
      score: p.score,
      totalTimeMs: p.totalTimeMs,
      correctCount: p.correctCount,
      rank,
    };
  });
}

/** Quán quân = mọi người đứng hạng 1 (có thể nhiều người nếu đồng hạng). Không ai ghi điểm => chưa có Quán quân. */
function findChampions(ranking) {
  return ranking.filter((r) => r.rank === 1 && r.score > 0);
}

module.exports = { rankPlayers, findChampions };
