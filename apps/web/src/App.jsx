import React from 'react'
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import BottomNav from '@app/components/Layout/BottomNav.jsx'
import Home from '@app/modules/home'
import Aware from '@app/modules/aware'
import Profile from '@app/modules/profile'
import Shop from '@app/modules/shop'
import Community from '@app/pages/Community.jsx'
import FortuneLedger from '@app/pages/FortuneLedger.jsx'
import Album from '@app/pages/Album.jsx'
import ProfileInfo from '@app/pages/ProfileInfo.jsx'
import MeditationHome from '@app/modules/meditate'
import MeditationPlayer from '@app/modules/meditate/player'
import { CloudAwarenessProvider } from '@app/context/CloudAwarenessContext.jsx'
import { ThemeProvider } from '@app/context/ThemeContext.jsx'
import { WealthProvider } from '@app/context/WealthContext.jsx'
import WebExperienceBanner from './components/WebExperienceBanner.jsx'
import DownloadPage from './pages/DownloadPage.jsx'
import PartnerPortalPage from './pages/PartnerPortalPage.jsx'
import '@app/App.css'

const Layout = () => (
  <>
    <div className="app-content">
      <Outlet />
    </div>
    <BottomNav />
  </>
)

const WebPrimaryPage = ({ children }) => (
  <div>
    <div style={{ padding: '18px 18px 0' }}>
      <WebExperienceBanner />
    </div>
    {children}
  </div>
)

const App = () => (
  <ThemeProvider>
    <WealthProvider>
      <CloudAwarenessProvider>
        <Router>
          <Routes>
            <Route path="/admin" element={<Navigate to="/partner" replace />} />
            <Route path="/admin/*" element={<Navigate to="/partner" replace />} />
            <Route path="/partner" element={<PartnerPortalPage />} />
            <Route path="/" element={<Layout />}>
            <Route index element={<WebPrimaryPage><Home /></WebPrimaryPage>} />
            <Route path="m" element={<MeditationHome />} />
            <Route path="meditation-tab" element={<Navigate to="/m" replace />} />
            <Route path="a" element={<WebPrimaryPage><Aware /></WebPrimaryPage>} />
            <Route path="aware" element={<Navigate to="/a" replace />} />
            <Route path="record" element={<Navigate to="/a" replace />} />
            <Route path="community" element={<Community />} />
            <Route path="profile" element={<WebPrimaryPage><Profile /></WebPrimaryPage>} />
            <Route path="profile/info" element={<ProfileInfo />} />
            <Route path="s" element={<WebPrimaryPage><Shop /></WebPrimaryPage>} />
            <Route path="shop" element={<Navigate to="/s" replace />} />
            <Route path="download" element={<DownloadPage />} />
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
