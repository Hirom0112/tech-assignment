import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { ReactElement } from 'react';
import type { RootState } from './store';
import StreakDashboard from './components/StreakDashboard';
import IntroScene from './components/IntroScene';
import LoginScreen from './components/LoginScreen';

/**
 * BL-1 routing + guard.
 * - Unauthenticated visitors are sent to /intro (video) → /login.
 * - Authenticated visitors land on the dashboard `/`.
 *
 * Demo bypass: the auth slice seeds `streak-001` as authenticated when
 * localStorage already holds a playerId, so a reload skips intro/login and
 * goes straight to the dashboard (no forced video every reload).
 */
function RequireAuth({ children }: { children: ReactElement }) {
  const isAuthenticated = useSelector(
    (s: RootState) => s.auth.isAuthenticated
  );
  return isAuthenticated ? children : <Navigate to="/intro" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/intro" element={<IntroScene />} />
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
