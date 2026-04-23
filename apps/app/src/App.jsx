import React from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import BottomNav from './components/Layout/BottomNav';
import Home from './modules/home';
import Record from './modules/aware';
import Community from './pages/Community';
import Profile from './modules/profile';
import FortuneLedger from './pages/FortuneLedger';
import Album from './pages/Album';
import ProfileInfo from './pages/ProfileInfo';
import MeditationHome from './modules/meditate';
import MeditationPlayer from './modules/meditate/player';
import Shop from './modules/shop';
import { WealthProvider } from './context/WealthContext';
import { CloudAwarenessProvider } from './context/CloudAwarenessContext';
import { ThemeProvider } from './context/ThemeContext';
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
    <ThemeProvider>
      <WealthProvider>
        <CloudAwarenessProvider>
          <Router>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="m" element={<MeditationHome />} />
                <Route path="meditation-tab" element={<Navigate to="/m" replace />} />
                <Route path="a" element={<Record />} />
                <Route path="aware" element={<Navigate to="/a" replace />} />
                <Route path="record" element={<Navigate to="/a" replace />} />
                <Route path="community" element={<Community />} />
                <Route path="profile" element={<Profile />} />
                <Route path="profile/info" element={<ProfileInfo />} />
                <Route path="s" element={<Shop />} />
                <Route path="shop" element={<Navigate to="/s" replace />} />
                <Route path="fortune-ledger" element={<FortuneLedger />} />
                <Route path="album" element={<Album />} />
              </Route>
              <Route path="/meditation" element={<MeditationPlayer />} />
            </Routes>
          </Router>
        </CloudAwarenessProvider>
      </WealthProvider>
    </ThemeProvider>
  );
}

export default App;
