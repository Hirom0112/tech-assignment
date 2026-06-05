import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import StreakDashboard from './components/StreakDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StreakDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
