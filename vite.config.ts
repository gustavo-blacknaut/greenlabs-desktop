import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const daRaiz = (caminho: string) => fileURLToPath(new URL(caminho, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    // O "@/" evita o ../../.. subindo de components para lib. O tsconfig tem o
    // mesmo apelido, e os dois precisam concordar.
    alias: { '@': daRaiz('./src') },
  },
  build: {
    rollupOptions: {
      // O worklet e uma entrada separada de proposito.
      //
      // Ele nao pode ser importado pelo bundle: o AudioWorklet carrega um
      // script solto, fora do grafo de modulos da pagina, e so aceita uma URL.
      // Sem esta entrada o Vite copiava o .ts cru para dist/, e o navegador
      // recebia TypeScript.
      input: {
        index: daRaiz('./index.html'),
        'wasapi-worklet': daRaiz('./src/audio/wasapi-worklet.ts'),
      },
      output: {
        // Nome fixo para o worklet: o codigo o referencia por caminho, e um
        // hash mudaria o endereco a cada build.
        entryFileNames: (pedaco) =>
          pedaco.name === 'wasapi-worklet'
            ? 'wasapi-worklet.js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
});
