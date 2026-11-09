# ☕ Coffee Manager

Hệ thống quản lý quán cà phê trên nền web: bán hàng, thực đơn, kho nguyên liệu, khách hàng thân thiết, nhân viên và báo cáo doanh thu, lợi nhuận.

> Đồ án môn học CNTT . Mã nguồn được xây dựng song song với báo cáo phân tích thiết kế (UML, thẻ CRC, thiết kế CSDL).

![Node](https://img.shields.io/badge/Node.js-Express_5-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-ESM-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)

---

## Mục lục

- [Công nghệ](#công-nghệ)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Các lệnh thường dùng](#các-lệnh-thường-dùng)
- [Kiến trúc](#kiến-trúc)
- [Quy tắc nghiệp vụ chính](#quy-tắc-nghiệp-vụ-chính)
- [Tài liệu](#tài-liệu)

## Công nghệ

**Backend** (`BE/`)

- Node.js, Express 5, TypeScript (ESM)
- PostgreSQL 16, Prisma ORM 7 (driver adapter `@prisma/adapter-pg`)
- Zod (kiểm tra dữ liệu đầu vào), JWT + bcrypt (xác thực)
- Helmet, CORS, express-rate-limit, Morgan
- Vitest + Supertest (kiểm thử)

**Frontend** (`FE/`)

- React 19, Vite, TypeScript
- Ant Design (giao diện), TanStack Query (state phía server), Axios
- React Router, Recharts (biểu đồ), Day.js

**Hạ tầng**

- Docker Compose (PostgreSQL)

## Cấu trúc thư mục

```
Coffe_Manager/
├── BE/                     # REST API (Express + Prisma)
│   ├── prisma/             # schema.prisma, migrations, seed
│   ├── src/
│   │   ├── modules/        # Mỗi module: routes / controller / service / schema
│   │   ├── middlewares/    # authenticate, authorize, validate, errorHandler
│   │   ├── app.ts
│   │   └── server.ts
│   └── test/               # Kiểm thử tích hợp (Vitest)
├── FE/                     # Ứng dụng web (React + Vite)
│   └── src/
│       ├── api/            # Axios client và các hàm gọi API
│       └── ...
├── docs/
│   ├── feature/            # Đặc tả từng module
│   ├── plan/               # Kế hoạch triển khai
│   ├── STACK.md            # Lựa chọn công nghệ và lý do
│   └── BÁO CÁO - NHÓM 31.docx
└── docker-compose.yml      # PostgreSQL 16
```

## Cài đặt và chạy

Hướng dẫn dưới đây giúp chạy dự án trên máy cá nhân (Windows, macOS hoặc Linux) từ đầu, kể cả khi máy chưa cài gì.

### Bước 0. Cài các công cụ cần thiết

| Công cụ                                                        | Phiên bản                                     | Ghi chú                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Git](https://git-scm.com/downloads)                              | bất kỳ                                        | Để clone mã nguồn                                                                                                      |
| [Node.js](https://nodejs.org/)                                    | **20 trở lên** (khuyên dùng bản LTS) | Cài kèm `npm`                                                                                                          |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | bất kỳ                                        | Để chạy PostgreSQL. Có thể thay bằng PostgreSQL 16 cài trực tiếp (xem [Không dùng Docker](#không-dùng-docker)) |

Kiểm tra đã cài đúng chưa:

```bash
git --version
node -v          # phải là v20.x trở lên
npm -v
docker --version
docker compose version
```

> Trên Windows, mở **Docker Desktop** và đợi nó báo "Engine running" trước khi chạy các lệnh `docker`.

### Bước 1. Clone mã nguồn

```bash
git clone https://github.com/Thanhle297/Coffe_Manager.git
cd Coffe_Manager
```

Mọi lệnh bên dưới đều giả định bạn đang đứng ở thư mục gốc `Coffe_Manager/` trừ khi có ghi `cd` vào thư mục khác.

### Bước 2. Khởi động cơ sở dữ liệu PostgreSQL

```bash
docker compose up -d
```

Lệnh này tải image `postgres:16` (lần đầu hơi lâu) và chạy database ở chế độ nền:

- Địa chỉ: `localhost:5432`
- User / Password / Database: `coffee` / `coffee` / `coffee_manager`
- Dữ liệu được lưu trong volume `pgdata`, tắt máy bật lại vẫn còn.

Kiểm tra container đang chạy:

```bash
docker compose ps        # cột STATUS phải là "running" / "Up"
```

### Bước 3. Cài đặt và chạy Backend (API)

Mở một cửa sổ terminal **mới** và chạy:

```bash
cd BE
```

**3.1. Tạo file cấu hình `.env`** từ file mẫu:

```bash
# macOS / Linux / Git Bash
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env

# Windows CMD
copy .env.example .env
```

Nội dung `.env` mặc định đã khớp với database ở Bước 2, có thể dùng ngay:

| Biến                     | Mặc định                                                  | Ý nghĩa                                                 |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `PORT`                  | `3000`                                                     | Cổng chạy API                                           |
| `DATABASE_URL`          | `postgresql://coffee:coffee@localhost:5432/coffee_manager` | Chuỗi kết nối PostgreSQL                               |
| `JWT_SECRET`            | `change-me`                                                | Khóa ký JWT, nên đổi thành chuỗi ngẫu nhiên dài |
| `JWT_EXPIRES_IN`        | `1d`                                                       | Thời hạn token đăng nhập                             |
| `CORS_ORIGIN`           | `http://localhost:5173`                                    | Địa chỉ Frontend được phép gọi API                |
| `SEED_MANAGER_USERNAME` | `admin`                                                    | Tên đăng nhập Quản lý đầu tiên                   |
| `SEED_MANAGER_PASSWORD` | `Admin@12345`                                              | Mật khẩu Quản lý đầu tiên                          |

**3.2. Cài thư viện:**

```bash
npm install
```

**3.3. Sinh Prisma Client** (thư mục `src/generated/prisma` không có sẵn trong git, bắt buộc phải chạy):

```bash
npm run prisma:generate
```

**3.4. Tạo bảng trong database** (áp dụng các migration):

```bash
npm run prisma:migrate
```

Nếu được hỏi đặt tên migration thì chỉ cần nhấn Enter (thường sẽ không hỏi vì schema đã khớp migration).

**3.5. Nạp dữ liệu mẫu:**

```bash
npm run prisma:seed
```

Lệnh này tạo: tài khoản Quản lý, hạng thành viên, nguyên liệu, nhà cung cấp, lô hàng, đồ uống kèm công thức, 10 bàn, 3 ca làm và 3 nhân viên mẫu. Có thể chạy lại nhiều lần mà không bị trùng dữ liệu.

**3.6. Chạy API:**

```bash
npm run dev
```

Mở trình duyệt vào [http://localhost:3000/health](http://localhost:3000/health), nếu thấy phản hồi JSON nghĩa là Backend đã chạy. **Giữ nguyên cửa sổ terminal này.**

### Bước 4. Cài đặt và chạy Frontend (giao diện web)

Mở thêm một cửa sổ terminal **mới** khác (Backend vẫn đang chạy ở terminal cũ), từ thư mục gốc dự án:

```bash
cd FE
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm install
npm run dev
```

File `.env` của Frontend chỉ có một biến `VITE_API_URL=http://localhost:3000` (địa chỉ Backend). Nếu đổi `PORT` ở Backend thì sửa biến này cho khớp.

### Bước 5. Đăng nhập

Mở [http://localhost:5173](http://localhost:5173) và đăng nhập bằng tài khoản Quản lý mặc định:

- Tên đăng nhập: `admin`
- Mật khẩu: `Admin@12345`

(hoặc giá trị `SEED_MANAGER_USERNAME` / `SEED_MANAGER_PASSWORD` bạn đã đặt trong `BE/.env`). Nên đổi mật khẩu sau lần đăng nhập đầu tiên. Tài khoản Nhân viên (`STAFF`) do Quản lý tạo trong ứng dụng.

### Những lần chạy sau

Không cần cài lại, chỉ cần 3 bước:

```bash
docker compose up -d              # ở thư mục gốc
cd BE && npm run dev              # terminal 1
cd FE && npm run dev              # terminal 2
```

Sau khi `git pull` code mới, chạy thêm trong `BE/`: `npm install`, `npm run prisma:generate`, `npm run prisma:migrate` (và `npm install` trong `FE/`) để cập nhật thư viện và cấu trúc database.

Tắt database khi không dùng: `docker compose down` (dữ liệu vẫn giữ). Muốn **xóa sạch dữ liệu** để làm lại từ đầu: `docker compose down -v`, sau đó chạy lại Bước 2 và các bước 3.4, 3.5.

### Không dùng Docker

Nếu đã cài sẵn PostgreSQL 16, tạo user và database tương ứng (hoặc dùng user có sẵn) rồi sửa `DATABASE_URL` trong `BE/.env`:

```sql
CREATE USER coffee WITH PASSWORD 'coffee' CREATEDB;
CREATE DATABASE coffee_manager OWNER coffee;
```

Quyền `CREATEDB` cần cho `prisma migrate dev` (tạo shadow database) và cho kiểm thử (tự tạo database `coffee_manager_test`). Sau đó làm tiếp từ Bước 3.

### Chạy kiểm thử (tùy chọn)

```bash
cd BE
npm test
```

Kiểm thử dùng database riêng `coffee_manager_test` (tự tạo và tự migrate), không ảnh hưởng dữ liệu chính. Cần database ở Bước 2 đang chạy.

### Lỗi thường gặp

| Hiện tượng                                         | Nguyên nhân và cách xử lý                                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot find module '.../generated/prisma/...'`     | Chưa sinh Prisma Client: chạy `npm run prisma:generate` trong `BE/`                                                                                                                       |
| `Can't reach database server at localhost:5432`     | Database chưa chạy: mở Docker Desktop, chạy `docker compose up -d`, kiểm tra `docker compose ps`                                                                                       |
| `port is already allocated` / cổng 5432 bị chiếm | Máy đã có PostgreSQL khác chạy ở 5432: tắt nó đi, hoặc đổi `"5432:5432"` thành `"5433:5432"` trong `docker-compose.yml` và sửa `DATABASE_URL` thành `localhost:5433` |
| `EADDRINUSE: address already in use :::3000`        | Cổng 3000 bị chiếm: đổi `PORT` trong `BE/.env` và `VITE_API_URL` trong `FE/.env` cho khớp                                                                                        |
| Frontend báo lỗi mạng / CORS khi đăng nhập      | Backend chưa chạy, hoặc `VITE_API_URL` (FE) và `CORS_ORIGIN` (BE) không khớp địa chỉ thực tế. Sửa `.env` xong phải khởi động lại `npm run dev`                         |
| Đăng nhập báo sai mật khẩu với `admin`       | Chưa chạy `npm run prisma:seed`, hoặc đã đổi mật khẩu trước đó. Seed sẽ bỏ qua nếu đã có tài khoản Quản lý                                                             |
| Lệnh `cp` không chạy trên Windows               | Dùng `Copy-Item` (PowerShell) hoặc `copy` (CMD), hoặc chạy trong Git Bash                                                                                                               |
| Lỗi sau khi `git pull`                             | Chạy lại `npm install`, `npm run prisma:generate`, `npm run prisma:migrate` trong `BE/` và `npm install` trong `FE/`                                                             |

## Các lệnh thường dùng

| Thư mục | Lệnh                             | Mô tả                                                                |
| --------- | --------------------------------- | ---------------------------------------------------------------------- |
| `BE`    | `npm run dev`                   | Chạy API ở chế độ watch                                           |
| `BE`    | `npm run build` / `npm start` | Biên dịch ra `dist/` và chạy bản build                          |
| `BE`    | `npm test`                      | Chạy kiểm thử (dùng database `coffee_manager_test`, tự migrate) |
| `BE`    | `npx tsc --noEmit`              | Kiểm tra kiểu                                                        |
| `BE`    | `npm run prisma:migrate`        | Tạo/áp dụng migration                                               |
| `FE`    | `npm run dev`                   | Chạy Vite dev server                                                  |
| `FE`    | `npm run build`                 | Build bản production                                                  |
| `FE`    | `npm run lint`                  | Kiểm tra code bằng oxlint                                            |

## Kiến trúc

### Backend

Mỗi tính năng là một module trong `BE/src/modules/<tên>/` gồm 4 file với trách nhiệm cố định:

| File                | Trách nhiệm                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `*.routes.ts`     | Định nghĩa đường dẫn và middleware (xác thực, phân quyền, validate)                             |
| `*.controller.ts` | Chỉ xử lý request/response                                                                               |
| `*.service.ts`    | Toàn bộ nghiệp vụ và truy cập Prisma (tương ứng các phương thức trong thẻ CRC của báo cáo) |
| `*.schema.ts`     | Schema Zod cho dữ liệu đầu vào                                                                         |

- Lỗi nghiệp vụ được ném ra bằng `AppError(status, message)` và được middleware chung chuyển thành `{ message }`.
- Các thao tác nhiều bước (thanh toán, nhập/xuất kho) chạy trong một Prisma transaction.
- Xác thực dùng một JWT duy nhất; `tokenVersion` của tài khoản được nhúng vào token và so khớp ở mỗi request, nên token cũ mất hiệu lực ngay khi đổi mật khẩu, khóa tài khoản hoặc đổi vai trò.

### Frontend

- Mọi request HTTP đi qua Axios instance trong `FE/src/api/client.ts` (tự gắn header `Authorization`).
- State phía server được quản lý bằng TanStack Query, không dùng Redux.

## Quy tắc nghiệp vụ chính

- **Công thức đồ uống** là cầu nối giữa thực đơn, kho và báo cáo: thanh toán đơn sẽ tự tạo phiếu xuất kho theo công thức, báo cáo lợi nhuận tính giá vốn theo công thức.
- **Thanh toán** là một giao dịch duy nhất: lưu hóa đơn, trừ kho, cộng điểm cho khách hàng, giải phóng bàn.
- **Giá bán** được sao chép vào dòng hóa đơn tại thời điểm bán. Đồ uống đã có trong hóa đơn chỉ bị ngừng kinh doanh, không bị xóa.
- **Xuất kho theo FEFO**: lô hết hạn sớm nhất được xuất trước.
