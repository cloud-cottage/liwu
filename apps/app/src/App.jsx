import React from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import BottomNav from './components/Layout/BottomNav';
import Home from './modules/home';
import Record from './modules/aware';
import Community from './pages/Community';
import Profile from './modules/profile';
import Challenges from './pages/Challenges';
import ChallengeDetail from './pages/ChallengeDetail';
import MeditationHome from './modules/meditate';
import MeditationPlayer from './modules/meditate/player';
import Shop from './modules/shop';
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
              <Route path="shop" element={<Shop />} />
              <Route path="challenges" element={<Challenges />} />
              <Route path="challenges/:id" element={<ChallengeDetail />} />
            </Route>
            <Route path="/meditation" element={<MeditationPlayer />} />
          </Routes>
        </Router>
      </CloudAwarenessProvider>
    </WealthProvider>
  );
}

export default App;
