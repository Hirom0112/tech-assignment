import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { ReactElement } from 'react';
import { Box } from '@mui/material';
import type { RootState } from './store';
import StreakDashboard from './components/StreakDashboard';
import LoginScreen from './components/LoginScreen';
import { introAlreadySeen } from './components/intro/useSequencer';

/**
 * The redesigned cinematic open lives in its own lazy chunk so Framer Motion
 * (LazyMotion + domAnimation, ~5KB) never lands in the dashboard bundle.
 */
const OpenSequence = lazy(() => import('./components/intro/OpenSequence'));

/**
 * BL-1 routing + guard.
 * - Unauthenticated visitors are sent to /intro (cinematic) → /login.
 * - Authenticated visitors land on the dashboard `/`.
 *
 * If the cinematic was already played this session (`introSeen`), the *auto*
 * redirect skips it (returning users land on /login). A direct or refreshed
 * visit to /intro ALWAYS replays — so reloading the tab restarts the open.
 */
function RequireAuth({ children }: { children: ReactElement }) {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  if (isAuthenticated) return children;
  return <Navigate to={introAlreadySeen() ? '/login' : '/intro'} replace />;
}

/** Black hold while the intro chunk loads (no flash before the cinematic). */
function IntroFallback() {
  return <Box sx={{ position: 'fixed', inset: 0, bgcolor: '#000' }} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/intro"
          element={
            // A direct/refreshed /intro always plays — refresh = restart.
            <Suspense fallback={<IntroFallback />}>
              <OpenSequence />
            </Suspense>
          }
        />
        <Route path="/login" element={<LoginScreen />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <StreakDashboard />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
