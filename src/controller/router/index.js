import { createRouter, createWebHistory } from 'vue-router'
import { DEV_PANEL } from '../../model/services/config.js'
import { useUserStore } from '../../model/stores/user.js'

/**
 * Routes from the IA table. meta.auth → needs a session; meta.onboarded → needs a travel style.
 * Heavy 3D views are lazy chunks so the landing page stays fast on phones.
 */
const routes = [
  { path: '/', name: 'landing', component: () => import('../../view/views/LandingView.vue') },
  { path: '/auth', name: 'auth', component: () => import('../../view/views/AuthView.vue') },
  { path: '/onboard', name: 'onboard', component: () => import('../../view/views/OnboardView.vue'), meta: { auth: true } },
  { path: '/plan', name: 'plan', component: () => import('../../view/views/PlanView.vue'), meta: { auth: true, onboarded: true, nav: true } },
  { path: '/mission', name: 'mission-active', component: () => import('../../view/views/MissionView.vue'), meta: { auth: true, nav: true } },
  { path: '/mission/:id', name: 'mission', component: () => import('../../view/views/MissionView.vue'), meta: { auth: true, nav: true } },
  { path: '/map', name: 'map', component: () => import('../../view/views/MapView.vue'), meta: { auth: true, nav: true, fullscreen: true } },
  { path: '/place/:id', name: 'place', component: () => import('../../view/views/PlaceView.vue'), meta: { nav: true } },
  { path: '/passport', name: 'passport', component: () => import('../../view/views/PassportView.vue'), meta: { auth: true, nav: true } },
  { path: '/codex', name: 'codex', component: () => import('../../view/views/CodexView.vue'), meta: { auth: true, nav: true } },
  { path: '/me', name: 'me', component: () => import('../../view/views/ProfileView.vue'), meta: { auth: true, nav: true } },
  { path: '/swipe', name: 'swipe', component: () => import('../../view/views/SwipeView.vue'), meta: { auth: true, nav: true } },
  { path: '/party/:id?', name: 'party', component: () => import('../../view/views/PartyView.vue'), meta: { auth: true, nav: true } },
  ...(DEV_PANEL ? [{ path: '/dev', name: 'dev', component: () => import('../../view/views/DevView.vue'), meta: { auth: true, nav: true } }] : []),
  { path: '/:pathMatch(.*)*', redirect: '/' },
  { path: '/3d-map', name: '3d-map', component: () => 
    import('../../view/views/3D_Map.vue') },
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
