# A Lương & CaPu · Our Little Universe

Không gian riêng cho hai người, với tài khoản riêng và dữ liệu chung. Tên mặc định, ảnh bìa, bảng màu và ngày bắt đầu yêu có thể đổi trong **Cài đặt**.

## Mở web

- Trên máy Windows đã được thiết lập, mở **http://127.0.0.1:8001**. Nếu máy chủ đã dừng, chạy **START_MONGODB_WINDOWS.bat**.
- Điện thoại cùng Wi-Fi mở `http://<địa-chỉ-IPv4-của-máy-Windows>:8001`. Xem IPv4 của Wi-Fi bằng `ipconfig`. Mạng khách hoặc tường lửa có thể chặn kết nối. Chỉ cho phép cổng web trên mạng riêng mà bạn tin cậy.
- **A_Luong_CaPu_Xem_Truoc.html** là bản demo có dữ liệu mẫu, mở thẳng bằng trình duyệt. Thay đổi chỉ lưu trong trình duyệt đó. Chat, tài khoản và đồng bộ cần bản máy chủ.

Lần đầu, tạo tài khoản chính bằng email và mật khẩu từ 10 ký tự. Mở **Cài đặt → Hai người → Tạo lời mời**. Gửi URL từ địa chỉ mà người kia truy cập được. Lời mời có hiệu lực 24 giờ và dùng một lần. Địa chỉ `127.0.0.1` chỉ mở trên máy đang chạy web.

## Tính năng

- Kỷ niệm đã xóa vào **Thùng rác** trên dòng thời gian. Cả hai có thể khôi phục kỷ niệm và ảnh đính kèm còn lưu. Kỷ niệm trong thùng rác được giữ cho tới khi khôi phục.
- Trang đang mở tự kiểm tra nội dung chung sau vài giây. Việc tải lại dữ liệu nền tạm dừng khi đang mở hộp thoại để giữ nội dung đang nhập.

- Nút **Tìm nội dung** trên thanh điều hướng hỗ trợ từ khóa tiếng Việt có dấu và không dấu. Kết quả gồm kỷ niệm, album, ảnh/video, thư tình và địa điểm.
- Trong **Cài đặt → Hai người → Đổi mật khẩu**, nhập mật khẩu hiện tại và xác nhận mật khẩu mới. Sau khi lưu, đăng nhập lại trên các thiết bị đang sử dụng tài khoản đó.

Trong mục **Hai người**, dùng **Đặt ngày yêu** để lưu ngày chung và xem bộ đếm ngay giữa hai avatar. Nút **Đổi avatar** hiện dưới hồ sơ của bạn. Nút **Lưu kỷ niệm** cho phép viết và đính kèm ảnh từ thiết bị hoặc album vào dòng thời gian chung.

- **Tin nhắn** gửi văn bản, emoji, ảnh và link HTTP/HTTPS. Có trả lời, thả cảm xúc, sửa, xóa, báo đã đọc, số tin chưa đọc, tải lịch sử và gửi lại.
- **Hồ sơ** cho mỗi người đổi tên, biệt danh, xem trước và cắt avatar. Ảnh hồ sơ đầu tiên tự được chọn. Có tùy chọn tự cập nhật khi tải ảnh hồ sơ mới và nút chọn ảnh từ album hoặc chat.
- **Lịch** có chế độ tháng và danh sách, sự kiện lặp, giờ nhắc trong web, loại sự kiện, địa điểm và checklist hẹn hò. Chuyển cuộc hẹn đã qua thành mục trên dòng thời gian. Nhắc lịch xuất hiện khi website đang mở.
- **Ngày yêu** tính theo giờ Việt Nam và hiển thị mốc tiếp theo. Lịch có ngày kỷ niệm hằng năm và mốc 100, 365, 1.000 ngày.
- **Cùng nhau** trả lời câu hỏi mỗi ngày, ghim ảnh hoặc lời nhắn từ chat, album và hũ kỷ niệm.
- Các mục cũ vẫn có trong web, gồm album ảnh/video, dòng thời gian và nhật ký, thư hẹn mở, hũ kỷ niệm, bucket list, bản đồ, hộp quà, nhạc và phòng 2.5D.

## Cài đặt trên máy khác

### Docker Compose với MongoDB

```powershell
docker compose up -d --build
```

Mở **http://127.0.0.1:8000**. Compose tạo hai volume bền vững cho MongoDB và tệp riêng. MongoDB chỉ nằm trong mạng nội bộ của Compose. Để dùng điện thoại trên Wi-Fi với Compose, sao chép `.env.example` thành `.env`, đặt `LAN_BIND=0.0.0.0` rồi chạy lại Compose. Khi dùng Atlas, truyền `MONGODB_URI` qua cấu hình triển khai.

### Windows với MongoDB riêng

Cài Python, chuẩn bị MongoDB cục bộ hoặc Atlas, rồi chạy trong thư mục dự án.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017'
$env:MONGODB_DB = 'our_little_universe'
$env:DATA_DIR = 'data/mongo'
.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8001
```

Dùng `--host 0.0.0.0` khi cần mở web trên Wi-Fi riêng. **START_WEBSITE_WINDOWS.bat** vẫn chạy chế độ phát triển SQLite khi không đặt `MONGODB_URI`. Mã nguồn đọc cấu hình từ biến môi trường. Tệp `.env` dùng cho Compose.

### HTTPS để dùng từ hai nơi

1. Trỏ tên miền về máy chủ và chạy ứng dụng dưới một tiến trình Uvicorn. Chỉ cho reverse proxy tiếp cận cổng nội bộ của ứng dụng.
2. Cấu hình reverse proxy TLS chuyển tiếp HTTP và WebSocket tới Uvicorn. Với Caddy, có thể dùng:

   ```caddyfile
   love.example.com {
       reverse_proxy 127.0.0.1:8000
   }
   ```

3. Đặt `COOKIE_SECURE=true` và `ALLOWED_ORIGINS=https://love.example.com`. Với cơ sở dữ liệu mới, đặt `OWNER_SETUP_CODE` dài và ngẫu nhiên trước khi mở trang công khai. Lưu các bí mật trong cấu hình của máy chủ.
4. MongoDB Atlas cần database user và cho phép địa chỉ IP đi ra của máy chủ ứng dụng. Lấy URI từ **Connect → Drivers**, đặt vào `MONGODB_URI` và chọn `MONGODB_DB`. [Hướng dẫn MongoDB Atlas](https://www.mongodb.com/docs/atlas/driver-connection/)
5. Gắn ổ lưu trữ bền vững cho `DATA_DIR`, vì byte ảnh, video và nhạc nằm trong `private_uploads`. Cả API, WebSocket và tải tệp đều yêu cầu phiên đăng nhập. Duy trì giới hạn tải tệp và sao lưu định kỳ.

## Chuyển SQLite và sao lưu

Tạm dừng ghi dữ liệu trong lúc sao chép hoặc sao lưu để dữ liệu và ảnh khớp nhau. Chạy thử trước, rồi dùng một database MongoDB mới cho lần nhập đầu. Công cụ chỉ đọc SQLite, giữ ID, liên kết và tệp gốc. Nếu gián đoạn, lệnh nhập lại sẽ bỏ qua bản ghi đã nhập và kiểm tra tệp đích trùng tên.

```powershell
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017'
$env:MONGODB_DB = 'our_little_universe'
$env:DATA_DIR = 'data/mongo'
.venv\Scripts\python.exe database_tools.py migrate data/memories.sqlite3 --dry-run
.venv\Scripts\python.exe database_tools.py migrate data/memories.sqlite3
```

Sao lưu máy chủ gồm cơ sở dữ liệu, tài khoản và tệp gốc. Cất bản sao ở nơi riêng tư. Mục **Sao lưu** trên web xuất ZIP cho người dùng đang đăng nhập và ẩn nội dung thư/quà còn khóa.

```powershell
.venv\Scripts\python.exe database_tools.py backup couple-backup.zip
$env:MONGODB_DB = 'universe_recovery'
$env:DATA_DIR = 'data/recovery'
.venv\Scripts\python.exe database_tools.py restore couple-backup.zip --dry-run
.venv\Scripts\python.exe database_tools.py restore couple-backup.zip
```

Khôi phục vào database và thư mục tệp mới, kiểm tra trước khi chuyển ứng dụng sang cấu hình mới. Hai người đăng nhập lại sau khi khôi phục.

## Kiểm thử

```powershell
.venv\Scripts\python.exe -m pip install pytest httpx
.venv\Scripts\python.exe -m pytest -q
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017'
.venv\Scripts\python.exe -m pytest -q
```

`TEST_MONGODB_URI` chạy bộ kiểm thử với database mẫu có tên riêng. Để kiểm tra giao diện, cài `playwright` và chạy `tests/browser_smoke.py` với URL của một máy chủ mẫu và `--chromium` trỏ tới Chrome. Tạo lại bản HTML độc lập bằng `python build_preview.py`.

## Chia sẻ qua Messenger và đăng nhập Google

GitHub lưu mã nguồn. Để có link gửi qua Messenger, hãy chạy ứng dụng FastAPI trên máy chủ có HTTPS. Sau khi trỏ tên miền vào máy chủ, sao chép .env.example thành .env và cấu hình:

```dotenv
COOKIE_SECURE=true
PUBLIC_ORIGIN=https://love.example.com
ALLOWED_ORIGINS=https://love.example.com
OWNER_SETUP_CODE=dat-ma-thiet-lap-dai-ngau-nhien
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Chạy `docker compose up -d --build` trên máy chủ và dùng reverse proxy HTTPS như mục triển khai ở trên. Giữ `LAN_BIND` ở chế độ mặc định để cổng Compose chỉ nhận kết nối từ reverse proxy cùng máy. Mở URL bằng mạng di động để kiểm tra trước khi gửi Pu.

Nếu muốn giữ tài khoản, kỷ niệm và ảnh/nhạc đang có, dùng `database_tools.py backup` trên máy cũ. Chuyển tệp ZIP qua kênh riêng và dùng `database_tools.py restore` vào MongoDB và ổ lưu trữ của máy chủ mới trước khi tạo tài khoản mới. Không đưa ZIP, `.env` hay thư mục `data` lên GitHub. Tài khoản cần đăng nhập lại sau khi khôi phục.

Trong Google Cloud, tạo OAuth client loại **Web application**. Thêm redirect URI chính xác, ví dụ `https://love.example.com/api/auth/google/callback`. Nếu ứng dụng Google đang ở chế độ thử nghiệm, thêm hai tài khoản Google vào danh sách test users. Đặt Client ID và Client Secret vào cấu hình máy chủ, rồi chạy lại Compose. [Hướng dẫn Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)

Pu đăng nhập bằng tài khoản web hiện có một lần, vào **Cài đặt → Hai người → Liên kết tài khoản Google** và chọn tài khoản Google của Pu. Sau đó có thể dùng **Đăng nhập bằng Google**. Chỉ tài khoản Google đã liên kết mới đăng nhập được. Nếu Messenger mở bằng trình duyệt trong ứng dụng và Google từ chối, chọn mở đường dẫn bằng Chrome hoặc Safari.

### Triển khai miễn phí trên Render và MongoDB Atlas

Tạo cụm Atlas Free, database user có quyền đọc/ghi database `our_little_universe`, và thêm dải IP outbound của dịch vụ Render vào IP access list của Atlas. Sau đó mở [Render Blueprint](https://dashboard.render.com/blueprints/new) và chọn kho GitHub này. Blueprint dùng gói Free và biến `MEDIA_STORAGE=gridfs`, vì hệ thống tệp của Render Free không bền vững. Nhập URI Atlas vào biến bí mật `MONGODB_URI` trên Render.

Để chuyển dữ liệu cũ, tạo bản sao lưu như hướng dẫn trên. Trên máy cục bộ, dùng URI Atlas, cùng tên database và `MEDIA_STORAGE=gridfs`, rồi chạy `database_tools.py restore` với bản sao lưu nằm trên máy. Cho phép IP của máy cục bộ trong Atlas trong lúc khôi phục. Bản sao lưu không cần đi qua GitHub. Đừng đăng ký lại tài khoản trên dịch vụ mới trước khi khôi phục xong.

Render Free có thể ngủ khi không có truy cập và mất thời gian khởi động lại. Cả dữ liệu và ảnh/nhạc phải nằm trong dung lượng của gói Atlas Free. Sau khi Render cấp URL, cấu hình Google theo hướng dẫn ở trên bằng chính URL đó. [Render Free](https://render.com/docs/free) · [MongoDB Atlas](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)
