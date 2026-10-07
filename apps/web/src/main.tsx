import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Toaster } from 'sonner';
import { AuthProvider } from './app/AuthProvider';
import { router } from './app/router';
import { ApiError } from './lib/api';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Tooltip.Provider delayDuration={200}>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
        </Tooltip.Provider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
