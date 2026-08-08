import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { resolveTabbarIconKey } from '@liwu/shared-assets'
import { SharedIcon } from '@liwu/shared-assets/react'
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
      {appPrimaryTabs.map(({ key, label, to, icon }) => {
        const tabActive = isTabActive(location.pathname, to)

        return (
          <NavLink
            key={key}
            to={to}
            end={key === 'home'}
            className={`${styles.link} ${tabActive ? styles.active : ''}`}
          >
            <span className={styles.iconWrap}>
              <SharedIcon
                name={resolveTabbarIconKey(icon, tabActive)}
                size={22}
                style={{ color: 'currentColor' }}
              />
            </span>
            <span className={styles.label}>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export default BottomNav
