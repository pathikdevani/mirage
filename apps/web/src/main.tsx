import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles/globals.css';
import { AuthProvider } from './auth/AuthProvider.js';
import { WsProvider } from './components/WsProvider.js';
import { ThemeProvider } from './components/theme/ThemeProvider.js';
import { queryClient } from './api/client.js';
import { AppRouter } from './router.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WsProvider>
            <BrowserRouter>
              <AppRouter />
            </BrowserRouter>
          </WsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
