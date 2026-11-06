import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './testEnv.js';

// Áp migration lên DB test riêng (tự tạo DB nếu chưa có). Cần `docker compose up -d`.
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
