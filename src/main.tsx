import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installClientErrorCapture } from '@/lib/diagnostics/client-errors';
import { recordHydrationStart } from '@/lib/telemetry/runtimeTelemetry';
import './index.css';
import App from './App';

installClientErrorCapture();
recordHydrationStart();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
