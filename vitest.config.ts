import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    env: {
      TABLE_QR_SIGNING_SECRET: 'test_table_qr_signing_secret_key_32_chars_long',
    }
  }
});
