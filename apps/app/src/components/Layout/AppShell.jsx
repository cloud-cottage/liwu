import React from 'react'
import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav.jsx'

const AppShell = () => (
  <>
    <div className="app-content">
      <Outlet />
    </div>
    <BottomNav />
  </>
)

export default AppShell
