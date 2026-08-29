// Ponto de entrada: monta o React na pagina e sai da frente.
//
// Este arquivo tinha 1522 linhas e continha a chamada inteira. Hoje contem o
// que um ponto de entrada deve conter.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '@/App';
import './styles.css';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('elemento #root nao encontrado no index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
