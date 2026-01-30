import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Wind, Sparkles, User } from 'lucide-react';
import styles from './BottomNav.module.css';

const BottomNav = () => {
    return (
        <nav className={styles.nav}>
            <NavLink
                to="/"
                className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
                <Home size={24} strokeWidth={1.5} />
                <span className={styles.label}>首页</span>
            </NavLink>

            <NavLink
                to="/meditation-tab"
                className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
                <Wind size={24} strokeWidth={1.5} />
                <span className={styles.label}>冥想</span>
            </NavLink>

            <NavLink
                to="/record"
                className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
                <Sparkles size={24} strokeWidth={1.5} />
                <span className={styles.label}>记录</span>
            </NavLink>

            <NavLink
                to="/profile"
                className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
                <User size={24} strokeWidth={1.5} />
                <span className={styles.label}>我的</span>
            </NavLink>
        </nav>
    );
};

export default BottomNav;
