import { defineConfig } from 'vitest/config';

// The first app construction in each test file loads Fastify and its plugins, which can take
// several seconds on a busy machine; the default 5s budget made that flaky.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], testTimeout: 20_000 } });
