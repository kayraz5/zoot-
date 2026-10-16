import { createRouter, createWebHistory } from 'vue-router'
import { DEV_PANEL } from '../lib/config.js'
import { useUserStore } from '../stores/user.js'

/**
 * Routes from the IA table. meta.auth → needs a session; meta.onboarded → needs a travel style.
 * Heavy 3D views are lazy chunks so the landing page stays fast on phones.
 */
const routes = [
  { path: '/', name: 'landing', component: () => import('../views/LandingView.vue') },
  { path: '/auth', name: 'auth', component: () => import('../views/AuthView.vue') },
  { path: '/onboard', name: 'onboard', component: () => import('../views/OnboardView.vue'), meta: { auth: true } },
  { path: '/plan', name: 'plan', component: () => import('../views/PlanView.vue'), meta: { auth: true, onboarded: true, nav: true } },
  { path: '/mission', name: 'mission-active', component: () => import('../views/MissionView.vue'), meta: { auth: true, nav: true } },
  { path: '/mission/:id', name: 'mission', component: () => import('../views/MissionView.vue'), meta: { auth: true, nav: true } },
  { path: '/map', name: 'map', component: () => import('../views/MapView.vue'), meta: { auth: true, nav: true, fullscreen: true } },
  { path: '/place/:id', name: 'place', component: () => import('../views/PlaceView.vue'), meta: { nav: true } },
  { path: '/passport', name: 'passport', component: () => import('../views/PassportView.vue'), meta: { auth: true, nav: true } },
  { path: '/codex', name: 'codex', component: () => import('../views/CodexView.vue'), meta: { auth: true, nav: true } },
  { path: '/me', name: 'me', component: () => import('../views/ProfileView.vue'), meta: { auth: true, nav: true } },
  { path: '/swipe', name: 'swipe', component: () => import('../views/SwipeView.vue'), meta: { auth: true, nav: true } },
  { path: '/party/:id?', name: 'party', component: () => import('../views/PartyView.vue'), meta: { auth: true, nav: true } },
  ...(DEV_PANEL ? [{ path: '/dev', name: 'dev', component: () => import('../views/DevView.vue'), meta: { auth: true, nav: true } }] : []),
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(async (to) => {
  const user = useUserStore()
  await user.init()
  if (to.meta.auth && !user.isAuthed) return { name: 'auth', query: { next: to.fullPath } }
  if (to.meta.onboarded && user.needsOnboarding) return { name: 'onboard', query: { next: to.fullPath } }
  return true
})
