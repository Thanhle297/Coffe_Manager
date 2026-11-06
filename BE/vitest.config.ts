import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
    // Các test tích hợp dùng chung một DB nên chạy tuần tự.
    fileParallelism: false,
  },
});
