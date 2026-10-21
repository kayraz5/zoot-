import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'

describe('App', () => {
  it('mounts and renders the routed view with the global hosts', async () => {
    // Memory-history router with a stub route so the real router guard (which hits the DB) is not used.
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<main data-test="home">Home</main>' }, meta: { nav: true } },
      ],
    })
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await flushPromises()

    expect(wrapper.find('[data-test="home"]').exists()).toBe(true)
    // Toast host is always mounted
    expect(wrapper.find('.zt-toasts').exists()).toBe(true)
    // Nav is hidden while the user is not authenticated
    expect(wrapper.findComponent({ name: 'AppNav' }).exists()).toBe(false)
  })
})
