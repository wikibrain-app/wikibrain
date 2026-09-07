import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { ToastProvider } from './lib/toast';
import { LangProvider } from './i18n';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LangProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>,
);
