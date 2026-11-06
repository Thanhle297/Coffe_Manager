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

- [Tính năng](#tính-năng)
- [Công nghệ](#công-nghệ)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Các lệnh thường dùng](#các-lệnh-thường-dùng)
- [Kiến trúc](#kiến-trúc)
- [Quy tắc nghiệp vụ chính](#quy-tắc-nghiệp-vụ-chính)
- [Tài liệu](#tài-liệu)

## Tính năng

| Module                                | Mô tả                                                                                                                                 | Trạng thái          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Xác thực & tài khoản**    | Đăng nhập JWT, phân quyền `MANAGER` / `STAFF`, khóa tài khoản, quản lý đặt lại mật khẩu, bắt buộc đổi mật khẩu | ✅ Hoàn thành       |
| **Khách hàng & tích điểm** | Hồ sơ khách hàng, hạng thành viên, tích và đổi điểm                                                                        | ✅ Hoàn thành       |
| **Kho nguyên liệu**           | Nguyên liệu, nhà cung cấp, lô hàng (xuất theo FEFO), nhập/xuất kho, mẻ pha chế, kiểm kê                                    | ✅ Hoàn thành       |
| **Đồ uống & công thức**    | Thực đơn, công thức (định lượng nguyên liệu cho từng món)                                                                  | 🚧 Đang phát triển |
| **Gọi món & thanh toán**     | Bàn, đơn hàng, hóa đơn, tự động trừ kho theo công thức                                                                     | 🚧 Đang phát triển |
| **Nhân viên**                 | Hồ sơ nhân viên, ca làm việc                                                                                                      | 🚧 Đang phát triển |
| **Báo cáo**                   | Doanh thu, lợi nhuận tính theo giá vốn công thức, biểu đồ                                                                     | 🚧 Đang phát triển |

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

### Yêu cầu

- Node.js 20 trở lên và npm
- Docker và Docker Compose (hoặc PostgreSQL 16 cài sẵn)

### 1. Clone dự án

```bash
git clone https://github.com/Thanhle297/Coffe_Manager.git
cd Coffe_Manager
```

### 2. Khởi động cơ sở dữ liệu

```bash
docker compose up -d
```

PostgreSQL chạy tại `localhost:5432` với user/password/database là `coffee` / `coffee` / `coffee_manager`.

### 3. Backend

```bash
cd BE
cp .env.example .env        # chỉnh JWT_SECRET và tài khoản quản lý mặc định nếu cần
npm install
npm run prisma:generate     # sinh Prisma Client
npm run prisma:migrate      # tạo bảng
npm run prisma:seed         # tạo tài khoản Quản lý đầu tiên
npm run dev                 # http://localhost:3000 (GET /health để kiểm tra)
```

Tài khoản quản lý mặc định lấy từ `SEED_MANAGER_USERNAME` / `SEED_MANAGER_PASSWORD` trong `.env` (mặc định `admin` / `Admin@12345`). Hãy đổi mật khẩu sau lần đăng nhập đầu tiên.

### 4. Frontend

```bash
cd FE
cp .env.example .env        # VITE_API_URL=http://localhost:3000
npm install
npm run dev                 # http://localhost:5173
```

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
