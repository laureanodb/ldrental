import { defineConfig } from 'vitest/config';

// Tests automáticos: corren antes de cada publicación (npm test) y en GitHub.
export default defineConfig({
  define: { __VERSION__: JSON.stringify('test') },
  test: { environment: 'happy-dom', include: ['tests/**/*.test.js'] },
});
