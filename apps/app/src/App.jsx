import React from 'react'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import AppShell from './components/Layout/AppShell.jsx'
import { ThemeProvider } from './context/ThemeContext'
import { WealthProvider } from './context/WealthContext'
import { CloudAwarenessProvider } from './context/CloudAwarenessContext'
import { appStackRoutes, appTabRoutes } from './navigation/appNavigation.jsx'
import './App.css'

function App() {
  return (
    <ThemeProvider>
      <WealthProvider>
        <CloudAwarenessProvider>
          <Router>
            <Routes>
              <Route path="/" element={<AppShell />}>
                {appTabRoutes.map(({ path, element }) => (
                  path === '/'
                    ? <Route key="app-home" index element={element} />
                    : <Route key={path} path={path} element={element} />
                ))}
              </Route>

              {appStackRoutes.map(({ path, element }) => (
                <Route key={path} path={path} element={element} />
              ))}
            </Routes>
          </Router>
        </CloudAwarenessProvider>
      </WealthProvider>
    </ThemeProvider>
  )
}

export default App
