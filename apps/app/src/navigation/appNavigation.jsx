import React from 'react'
import { Navigate } from 'react-router-dom'
import { appRoutes } from './routes.js'
import Home from '../modules/home'
import Record from '../modules/aware'
import Profile from '../modules/profile'
import Shop from '../modules/shop'
import MeditationHome from '../modules/meditate'
import MeditationPlayer from '../modules/meditate/player'
import FortuneLedger from '../pages/FortuneLedger'
import Album from '../pages/Album'
import ProfileInfo from '../pages/ProfileInfo'

export const appTabRoutes = [
  {
    path: appRoutes.home,
    element: <Home />
  },
  {
    path: appRoutes.meditate,
    element: <MeditationHome />
  },
  {
    path: 'meditation-tab',
    element: <Navigate to={appRoutes.meditate} replace />
  },
  {
    path: appRoutes.aware,
    element: <Record />
  },
  {
    path: 'aware',
    element: <Navigate to={appRoutes.aware} replace />
  },
  {
    path: 'record',
    element: <Navigate to={appRoutes.aware} replace />
  },
  {
    path: appRoutes.profile,
    element: <Profile />
  },
  {
    path: appRoutes.shop,
    element: <Shop />
  },
  {
    path: 'shop',
    element: <Navigate to={appRoutes.shop} replace />
  }
]

export const appStackRoutes = [
  {
    path: appRoutes.profileInfo,
    element: <ProfileInfo />
  },
  {
    path: appRoutes.fortuneLedger,
    element: <FortuneLedger />
  },
  {
    path: appRoutes.album,
    element: <Album />
  },
  {
    path: appRoutes.meditationPlayer,
    element: <MeditationPlayer />
  }
]
