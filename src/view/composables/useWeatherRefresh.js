import { onMounted, onUnmounted } from 'vue'
import { useUiStore } from '../../model/stores/ui.js'

const REFRESH_MS = 2 * 60000 // lightning changes fast; the weather service caches each feed, so this is cheap

/** Loads forecast + PSI + lightning into the ui store now, then every 2 minutes while the page is open. */
export function useWeatherRefresh(lat, lng) {
  const ui = useUiStore()
  let timer = null

  onMounted(() => {
    const refresh = () => ui.loadWeather(lat, lng) // handles its own errors, so a failure never blocks the page
    refresh()
    timer = setInterval(refresh, REFRESH_MS)
  })

  onUnmounted(() => clearInterval(timer))
}
