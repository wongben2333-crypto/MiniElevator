import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The shipped-config survival test runs 7 seeds × 3 days (~113k sim steps);
    // give it headroom so a loaded machine does not trip the 5s default.
    testTimeout: 20000,
  },
});
