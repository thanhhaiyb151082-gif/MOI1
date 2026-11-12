# Hoá học Challenge – Game trắc nghiệm thời gian thực

Cuộc thi trắc nghiệm trực tuyến cho sự kiện: người chơi quét mã QR bằng điện thoại, trả lời 10 câu hỏi
Chương 2 – Bảng tuần hoàn các nguyên tố hoá học (Hoá học 10, Kết nối tri thức).

## Luật chơi chính thức

| Mục | Quy định |
|---|---|
| Số câu | 10 câu |
| Thời gian | 20 giây mỗi câu |
| Điểm | Đúng +10, sai hoặc bỏ qua +0 |
| Loại người chơi | Không loại ai |
| Xếp hạng | Tổng điểm giảm dần, rồi tổng thời gian trả lời **đúng** tăng dần (tính bằng mili-giây) |
| Đồng hạng | Bằng cả điểm lẫn thời gian thì cùng thứ hạng (1, 1, 3, …) |

Các hằng số này nằm trong `src/config.js`. Thời gian trả lời do **máy chủ** đo, không phụ thuộc đồng hồ điện thoại.

## Cấu trúc thư mục

```
quiz-game/
├── server.js            Backend: Express + Socket.IO
├── package.json         Khai báo thư viện và lệnh chạy
├── questions.json       10 câu hỏi (sửa nội dung tại đây)
├── .env.example         Mẫu biến môi trường
├── .gitignore
├── src/                 Logic game (cấu hình, chấm điểm, xếp hạng, máy trạng thái, Socket.IO)
├── test/                Kiểm thử logic
└── public/
    ├── index.html       Trang người chơi (điện thoại)
    └── admin.html       Trang MC: điều khiển + màn chiếu + mã QR
```

## Cách dùng khi thi

1. MC mở `https://<link-của-bạn>/admin.html` trên máy tính nối máy chiếu, đăng nhập bằng `ADMIN_PASSWORD`.
2. Phòng chờ hiện **mã QR và link**. Người chơi quét mã, nhập tên, bấm **Vào chơi**.
3. MC bấm **▶ Bắt đầu cuộc thi**. Mỗi câu 20 giây, có nhạc đồng hồ tích tắc; hết giờ hệ thống tự chấm điểm.
4. Sau mỗi câu, màn chiếu công bố đáp án, thống kê và bảng xếp hạng. MC bấm **Câu tiếp theo ➜**
   (phím **Space** hoặc **→** cũng được). Sau câu 10, bấm **🏆 Công bố Quán quân**.
5. Muốn chơi lại: **↺ Chơi lại ván mới** (giữ người chơi) hoặc **🗑 Xoá người chơi** (mọi người nhập tên lại).

Mẹo: nhắn người chơi để điện thoại ở chế độ im lặng nếu đông người, vì mỗi điện thoại đều có tiếng tích tắc
(người chơi có nút 🔊 để tắt). Âm thanh chỉ phát sau khi người dùng chạm vào màn hình lần đầu (quy định của trình duyệt).

---

## Chạy thử trên máy tính (tuỳ chọn)

Cần cài [Node.js](https://nodejs.org) phiên bản 18 trở lên.

```bash
npm install
# macOS / Linux
ADMIN_PASSWORD=matkhau123 npm start
# Windows (PowerShell)
$env:ADMIN_PASSWORD="matkhau123"; npm start
```

Mở `http://localhost:3000` (người chơi) và `http://localhost:3000/admin.html` (MC).
Chạy kiểm thử logic: `npm test`.

---

## Bước 1. Đưa dự án lên GitHub

1. Đăng ký tài khoản tại https://github.com (miễn phí) và đăng nhập.
2. Bấm dấu **+** góc trên bên phải → **New repository**.
3. Đặt tên, ví dụ `quiz-hoa-hoc`. Chọn **Public** hoặc **Private** (cả hai đều dùng được với Render/Railway).
   **Không** tích "Add a README" vì dự án đã có sẵn. Bấm **Create repository**.

**Cách A: tải file lên bằng trình duyệt (không cần cài Git)**

1. Giải nén file ZIP của dự án.
2. Ở trang repository vừa tạo, bấm **uploading an existing file**.
3. Kéo thả **toàn bộ nội dung bên trong thư mục `quiz-game`** (gồm `server.js`, `package.json`, thư mục `src`, `public`, …)
   vào khung tải lên. Lưu ý: `server.js` và `package.json` phải nằm ở **cấp ngoài cùng** của repository,
   không nằm trong thư mục con.
4. Kéo xuống, bấm **Commit changes**.

**Cách B: dùng Git trên máy tính**

```bash
cd quiz-game
git init
git add .
git commit -m "Hoa hoc Challenge"
git branch -M main
git remote add origin https://github.com/<ten-tai-khoan>/quiz-hoa-hoc.git
git push -u origin main
```

Kiểm tra: trên trang repository phải thấy ngay `server.js`, `package.json`, `public`, `src`.
Không có thư mục `node_modules` và không có file `.env` (đã được `.gitignore` loại trừ).
**Tuyệt đối không đưa mật khẩu admin lên GitHub.**

---

## Bước 2A. Triển khai trên Render (khuyên dùng, có gói miễn phí)

1. Vào https://render.com, bấm **Get Started** và đăng nhập bằng tài khoản GitHub.
2. Bấm **New +** → **Web Service** → chọn repository `quiz-hoa-hoc` (cho Render quyền truy cập GitHub nếu được hỏi).
3. Điền cấu hình:

   | Ô | Giá trị |
   |---|---|
   | Name | Tên bạn thích, ví dụ `quiz-hoa-hoc` (sẽ thành một phần của link) |
   | Region | Singapore (gần Việt Nam nhất) |
   | Branch | `main` |
   | Runtime / Language | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |

4. Mở mục **Environment Variables** (hoặc **Advanced**), thêm biến:
   - `ADMIN_PASSWORD` = mật khẩu MC bạn muốn đặt (nên dài, khó đoán).
5. Bấm **Create Web Service** và chờ vài phút đến khi trạng thái là **Live**.
6. Link công khai hiện ở đầu trang, dạng `https://quiz-hoa-hoc.onrender.com`.
   - Người chơi: link gốc `https://quiz-hoa-hoc.onrender.com/`
   - MC: `https://quiz-hoa-hoc.onrender.com/admin.html`

**Lưu ý gói Free của Render** (theo tài liệu của Render tại thời điểm soạn hướng dẫn này, hãy kiểm tra lại tại
https://render.com/docs/free):

- Dịch vụ tự **ngủ sau 15 phút không có truy cập**. Lần truy cập kế tiếp phải chờ khoảng **1 phút** để khởi động lại.
  Vì vậy hãy **mở trang admin trước giờ thi 10 đến 15 phút** để đánh thức máy chủ, và giữ trang đó mở.
  Khi đang thi, các tin nhắn WebSocket giúp dịch vụ không bị ngủ.
- Có hạn mức 750 giờ chạy mỗi tháng cho mỗi tài khoản, thừa cho một buổi sự kiện.
- Ổ đĩa là tạm thời: mỗi lần triển khai lại hoặc khởi động lại thì file `snapshot.json` bị mất.
  **Không triển khai lại và không sửa mã trong lúc đang thi.**
- Chỉ chạy một instance (đúng với thiết kế lưu trạng thái trong RAM).

---

## Bước 2B. Triển khai trên Railway (phương án thay thế)

1. Vào https://railway.com, đăng nhập bằng GitHub.
2. Bấm **New Project** → **Deploy from GitHub repo** → chọn `quiz-hoa-hoc`.
3. Railway tự nhận dạng dự án Node.js, chạy `npm install` và `npm start`.
4. Mở dịch vụ vừa tạo → thẻ **Variables** → thêm `ADMIN_PASSWORD` = mật khẩu MC. Dịch vụ sẽ tự triển khai lại.
5. Mở thẻ **Settings** → mục **Networking** → bấm **Generate Domain** để nhận link công khai
   dạng `https://xxxx.up.railway.app`.
6. Người chơi dùng link gốc; MC dùng thêm `/admin.html`.

**Lưu ý về Railway** (theo tài liệu tại thời điểm soạn, kiểm tra lại tại https://docs.railway.com/pricing/free-trial):
Railway không có gói miễn phí dùng thoải mái như Render. Tài khoản mới nhận khoản tín dụng dùng thử một lần
(khoảng 5 USD, hết hạn sau tối đa 30 ngày); sau đó là gói Free với tín dụng rất nhỏ mỗi tháng hoặc phải
trả phí theo mức dùng. Bù lại, dịch vụ không bị "ngủ" như gói Free của Render. Nếu chỉ cần dùng cho một buổi sự kiện,
cả hai đều làm được; nên đọc trang giá của Railway trước khi chọn.

---

## Bước 3. Lấy link và mã QR cho người chơi

- Link người chơi chính là **địa chỉ gốc** của dịch vụ (không có `/admin.html`).
- Mở trang `/admin.html` và đăng nhập: **phòng chờ tự tạo mã QR** từ chính địa chỉ bạn đang truy cập.
  Hãy luôn mở trang admin bằng link công khai (https://…onrender.com), **không** mở bằng `localhost`,
  nếu không mã QR sẽ trỏ về máy của bạn.
- Giữa cuộc thi muốn cho người đến muộn tham gia: bấm nút **📱** ở góc trên để hiện mã QR phóng to.
- Có thể chụp màn hình mã QR để in lên poster hoặc chiếu trước giờ thi.
- Mã QR được tạo bằng thư viện tải từ `cdnjs.cloudflare.com`. Nếu máy MC không có Internet vào được trang này,
  hệ thống tự dùng dịch vụ tạo QR dự phòng; nếu cả hai đều không được, vẫn có link để gửi qua Zalo/nhóm lớp.

---

## Danh sách kiểm tra trước giờ thi

- [ ] Mở `…/admin.html` 10 đến 15 phút trước giờ thi (đánh thức máy chủ nếu dùng Render Free).
- [ ] Đăng nhập được và thấy mã QR.
- [ ] Thử vào bằng 2 đến 3 điện thoại thật, chơi thử một vòng, rồi bấm **🗑 Xoá người chơi** để dọn sạch.
- [ ] Kiểm tra loa, bật âm thanh trên trang admin (chạm vào màn hình một lần để trình duyệt cho phép phát tiếng).
- [ ] Đã sửa `questions.json` đúng nội dung câu hỏi và đáp án mong muốn.
- [ ] Đã đặt `ADMIN_PASSWORD` mạnh; không để lộ link admin cho người chơi.

## Sửa câu hỏi

Mở `questions.json`. Mỗi câu có dạng:

```json
{
  "text": "Nội dung câu hỏi",
  "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
  "answer": 1,
  "explanation": "Giải thích hiện sau khi công bố đáp án",
  "image": "/images/ten-anh.png"
}
```

`answer` là **chỉ số bắt đầu từ 0** của đáp án đúng (0 = A, 1 = B, 2 = C, 3 = D). `image` là tuỳ chọn;
đặt file ảnh vào `public/images/`. Sau khi sửa, đưa lên GitHub, Render/Railway sẽ tự triển khai lại.

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Admin báo "chưa đặt ADMIN_PASSWORD" | Thêm biến môi trường `ADMIN_PASSWORD` trên Render/Railway rồi triển khai lại |
| Mở link rất lâu mới thấy trang | Render Free đang đánh thức, chờ khoảng 1 phút |
| Build lỗi "Cannot find module" hoặc "no package.json" | `package.json` đang nằm trong thư mục con; phải nằm ở ngoài cùng repository |
| Điện thoại không có tiếng tích tắc | Chạm vào màn hình một lần, kiểm tra nút 🔊 và chế độ im lặng của máy |
| Người chơi bị rớt mạng | Trang tự kết nối lại và giữ nguyên điểm; không cần nhập lại tên |
| Máy chủ khởi động lại giữa cuộc thi | Điểm được khôi phục từ snapshot nếu còn; câu đang dở bị bỏ qua, MC bấm **Câu tiếp theo** để chơi tiếp |

## Ghi chú kỹ thuật

- Trạng thái game nằm trong RAM của một tiến trình Node duy nhất; không chạy nhiều instance.
- Thời gian trả lời: `round(mốc nhận gói tin − mốc phát câu hỏi)` đo bằng `process.hrtime` ở máy chủ.
  Server chốt câu sau 20 giây cộng 300 ms (biến `GRACE_MS`) để bù độ trễ mạng; thời gian ghi nhận tối đa 20.000 ms.
- Chỉ nhận lần chọn đầu tiên của mỗi người cho mỗi câu; đáp án đúng không được gửi xuống điện thoại trước khi hết giờ.
