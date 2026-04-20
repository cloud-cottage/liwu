import React from 'react'
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import BottomNav from '@app/components/Layout/BottomNav.jsx'
import Home from '@app/modules/home'
import Aware from '@app/modules/aware'
import Profile from '@app/modules/profile'
import Shop from '@app/modules/shop'
import Community from '@app/pages/Community.jsx'
import Challenges from '@app/pages/Challenges.jsx'
import ChallengeDetail from '@app/pages/ChallengeDetail.jsx'
import FortuneLedger from '@app/pages/FortuneLedger.jsx'
import Album from '@app/pages/Album.jsx'
import MeditationHome from '@app/modules/meditate'
import MeditationPlayer from '@app/modules/meditate/player'
import { CloudAwarenessProvider } from '@app/context/CloudAwarenessContext.jsx'
import { ThemeProvider } from '@app/context/ThemeContext.jsx'
import { WealthProvider } from '@app/context/WealthContext.jsx'
import '@app/App.css'

const Layout = () => (
  <>
    <div className="app-content">
      <Outlet />
    </div>
    <BottomNav />
  </>
)

const App = () => (
  <ThemeProvider>
    <WealthProvider>
      <CloudAwarenessProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="meditation-tab" element={<MeditationHome />} />
              <Route path="aware" element={<Aware />} />
              <Route path="record" element={<Navigate to="/aware" replace />} />
              <Route path="community" element={<Community />} />
              <Route path="profile" element={<Profile />} />
              <Route path="shop" element={<Shop />} />
              <Route path="challenges" element={<Challenges />} />
              <Route path="challenges/:id" element={<ChallengeDetail />} />
              <Route path="fortune-ledger" element={<FortuneLedger />} />
              <Route path="album" element={<Album />} />
            </Route>
            <Route path="/meditation" element={<MeditationPlayer />} />
          </Routes>
        </Router>
      </CloudAwarenessProvider>
    </WealthProvider>
  </ThemeProvider>
)

export default App
