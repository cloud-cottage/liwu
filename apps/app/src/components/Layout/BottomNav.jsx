import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { appPrimaryTabs } from '../../navigation/tabs.js'
import styles from './BottomNav.module.css'

const isTabActive = (currentPathname = '', targetPathname = '') => {
  if (targetPathname === '/') {
    return currentPathname === '/'
  }

  return currentPathname === targetPathname || currentPathname.startsWith(`${targetPathname}/`)
}

const BottomNav = () => {
  const location = useLocation()

  return (
    <nav className={styles.nav}>
      {appPrimaryTabs.map(({ key, label, to, icon: Icon }) => (
        <NavLink
          key={key}
          to={to}
          className={({ isActive }) => `${styles.link} ${(isActive || isTabActive(location.pathname, to)) ? styles.active : ''}`}
        >
          <span className={styles.iconWrap}>
            <Icon size={22} strokeWidth={1.7} />
          </span>
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default BottomNav
