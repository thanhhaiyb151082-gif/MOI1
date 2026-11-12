'use strict';

// Đồng hồ thật. Engine nhận đồng hồ qua tham số nên test có thể thay bằng đồng hồ giả.
//
// nowMono(): đồng hồ đơn điệu (monotonic) có độ phân giải dưới mili-giây,
//            KHÔNG bị nhảy khi hệ điều hành chỉnh giờ. Dùng để đo thời gian trả lời.
// nowEpoch(): giờ treo tường (ms), chỉ dùng để gửi cho client hiển thị đồng hồ.
module.exports = {
  nowMono: () => Number(process.hrtime.bigint()) / 1e6,
  nowEpoch: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};
