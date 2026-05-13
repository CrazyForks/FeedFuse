import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sharedExcludes = [
  ...configDefaults.exclude,
  '**/.next/**',
  '**/.worktrees/**',
  '**/.pnpm-store/**',
  '**/artifacts/**',
];

const nodeTestGlobs = [
  'src/test/server/**/*.test.ts',
  'src/test/worker/**/*.test.ts',
  'src/test/app/api/**/*.test.ts',
  'src/test/lib/**/*.test.ts',
  'src/test/utils/**/*.test.ts',
  'src/test/data/**/*.test.ts',
];

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: nodeTestGlobs,
          exclude: sharedExcludes,
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/test/**/*.{test,spec}.{ts,tsx}'],
          exclude: [...sharedExcludes, ...nodeTestGlobs],
        },
      },
    ],
  },
});
