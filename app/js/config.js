/* Cấu hình tùy chọn.
 * Nếu điền địa chỉ Web App Apps Script vào đây (kết thúc bằng /exec) thì link gửi học sinh
 * sẽ ngắn gọn hơn và học sinh có thể vào bằng MÃ ĐỀ ở trang chủ.
 * Để trống vẫn chạy bình thường (địa chỉ máy chủ được gắn sẵn trong link). */
window.QUIZ_API = '';

/* Địa chỉ trang web công khai (dùng cho bản ứng dụng Windows/Mac khi chạy bản đóng gói sẵn).
 * Ứng dụng tự điền giá trị này từ app-config.json — không cần sửa ở đây. */
if (!window.QUIZ_PUBLIC_URL) window.QUIZ_PUBLIC_URL = '';
