import React from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import BottomNav from './components/Layout/BottomNav';
import Home from './pages/Home';
import Record from './pages/Record';
import Community from './pages/Community';
import Profile from './pages/Profile';
import Challenges from './pages/Challenges';
import ChallengeDetail from './pages/ChallengeDetail';
import MeditationHome from './pages/MeditationHome';
import MeditationPlayer from './pages/MeditationPlayer';
import Dashboard from './pages/Dashboard';
import { WealthProvider } from './context/WealthContext';
import { CloudAwarenessProvider } from './context/CloudAwarenessContext';
import './App.css';

const Layout = () => {
  return (
    <>
      <div className="app-content">
        <Outlet />
      </div>
      <BottomNav />
    </>
  );
};

function App() {
  return (
    <WealthProvider>
      <CloudAwarenessProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="meditation-tab" element={<MeditationHome />} />
              <Route path="aware" element={<Record />} />
              <Route path="record" element={<Navigate to="/aware" replace />} />
              <Route path="community" element={<Community />} />
              <Route path="profile" element={<Profile />} />
              <Route path="challenges" element={<Challenges />} />
              <Route path="challenges/:id" element={<ChallengeDetail />} />
            </Route>
            <Route path="/meditation" element={<MeditationPlayer />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </Router>
      </CloudAwarenessProvider>
    </WealthProvider>
  );
}

export default App;
