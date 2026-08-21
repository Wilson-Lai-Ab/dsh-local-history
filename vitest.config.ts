import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      exclude: [
        'src/types.ts',
      ],
    },
  },
})
