import { meta, common, games, roles, bet, presets, inputMode } from './ko/common'
import { auth } from './ko/auth'
import { adminDashboard, adminConsole } from './ko/admin'
import { wallet, account } from './ko/wallet'
import { promotionsAdmin, promo } from './ko/promotions'
import { home } from './ko/home'
import {
  room,
  table,
  actionBar,
  memberSheet,
  lobby,
  dealer,
  monitor,
  roundLog,
  roomForm,
  settings,
  newRoom,
} from './ko/room'
import { result, ranking } from './ko/result'
import { guide, about } from './ko/guide'
import { advisor } from './ko/advisor'
import { fairness } from './ko/fairness'
import { ui, loading, errorPage } from './ko/system'
import { errors } from './ko/errors'

export const ko = {
  meta,
  common,
  games,
  roles,
  bet,
  presets,
  inputMode,
  auth,
  adminDashboard,
  adminConsole,
  wallet,
  account,
  promotionsAdmin,
  home,
  room,
  table,
  actionBar,
  memberSheet,
  lobby,
  dealer,
  monitor,
  roundLog,
  roomForm,
  settings,
  newRoom,
  result,
  ranking,
  guide,
  about,
  advisor,
  promo,
  fairness,
  ui,
  loading,
  errorPage,
  errors,
} as const

type DeepStrings<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]>
}

export type Dictionary = DeepStrings<typeof ko>
