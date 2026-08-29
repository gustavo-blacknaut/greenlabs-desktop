import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    // O "@/" evita o ../../.. subindo de components para lib. O tsconfig tem o
    // mesmo apelido, e os dois precisam concordar.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
