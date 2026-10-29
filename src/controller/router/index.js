import { createRouter, createWebHistory } from 'vue-router'
import { DEV_PANEL } from '../../model/services/config.js'
import { useUserStore } from '../../model/stores/user.js'

/**
 * Routes from the IA table. meta.auth → needs a session; meta.onboarded → needs a travel style.
 * Heavy 3D views are lazy chunks so the landing page stays fast on phones.
 */
const routes = [
  { path: '/', name: 'landing', component: () => import('../../view/features/landing/LandingView.vue') },
  { path: '/auth', name: 'auth', component: () => import('../../view/features/auth/AuthView.vue') },
  { path: '/onboard', name: 'onboard', component: () => import('../../view/features/auth/OnboardView.vue'), meta: { auth: true } },
  { path: '/plan', name: 'plan', component: () => import('../../view/features/plan/PlanView.vue'), meta: { auth: true, onboarded: true, nav: true } },
  { path: '/mission', name: 'mission-active', component: () => import('../../view/features/mission/MissionView.vue'), meta: { auth: true, nav: true } },
  // Focused timeline editor: durations/order, with the bottom nav hidden so it
  // doesn't compete with the controls.
  { path: '/mission/:id/schedule', name: 'mission-schedule', component: () => import('../../view/features/mission/ScheduleView.vue'), meta: { auth: true, nav: false } },
  { path: '/mission/:id', name: 'mission', component: () => import('../../view/features/mission/MissionView.vue'), meta: { auth: true, nav: true } },
  { path: '/map', name: 'map', component: () => import('../../view/features/map/MapView.vue'), meta: { auth: true, fullscreen: true } },
  // Dressing room for the 3D traveller (src/view/features/character/traveller.js). No auth so it's
  // quick to open while you're tweaking his outfits.
  { path: '/wardrobe', name: 'wardrobe', component: () => import('../../view/features/character/WardrobeView.vue') },
  { path: '/place/:id', name: 'place', component: () => import('../../view/features/places/PlaceView.vue'), meta: { nav: true } },
  { path: '/passport', name: 'passport', component: () => import('../../view/features/passport/PassportView.vue'), meta: { auth: true, nav: true } },
  { path: '/codex', name: 'codex', component: () => import('../../view/features/passport/CodexView.vue'), meta: { auth: true, nav: true } },
  // Browse every place in the catalog (Kayra). Open without an account, like /place/:id.
  { path: '/explore', name: 'explore', component: () => import('../../view/features/places/ExploreView.vue'), meta: { nav: true } },
  { path: '/me', name: 'me', component: () => import('../../view/features/profile/ProfileView.vue'), meta: { auth: true, nav: true } },
  { path: '/swipe', name: 'swipe', component: () => import('../../view/features/mission/SwipeView.vue'), meta: { auth: true, nav: true } },
  // Social quests: hosts open a window of stops, guests join part of it (docs/social-quests-spec.md).
  { path: '/quests', name: 'quests', component: () => import('../../view/features/quests/QuestsView.vue'), meta: { auth: true, nav: true } },
  { path: '/quests/:id', name: 'quest', component: () => import('../../view/features/quests/QuestDetailView.vue'), meta: { auth: true, nav: true } },
  { path: '/party/:id?', redirect: (to) => (to.params.id ? `/quests/${to.params.id}` : '/quests') },
  ...(DEV_PANEL ? [{ path: '/dev', name: 'dev', component: () => import('../../view/features/dev/DevView.vue'), meta: { auth: true, nav: true } }] : []),
  { path: '/:pathMatch(.*)*', redirect: '/' },
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
