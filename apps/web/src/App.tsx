import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import HostPage from './pages/HostPage';
import JoinPage from './pages/JoinPage';
import PlayerPage from './pages/PlayerPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/host/:roomCode?" element={<HostPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/play/:roomCode" element={<PlayerPage />} />
    </Routes>
  );
}
