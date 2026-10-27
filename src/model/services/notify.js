/**
 * Phone / browser notifications for quest chat, used only while the app is in the background.
 * (iPhone Safari allows them only for apps added to the Home Screen; elsewhere they just work.)
 */

export const canNotify = () => typeof window !== 'undefined' && 'Notification' in window

/** Ask once, at a moment that makes sense (joining a quest). Never throws. */
export async function askNotifyPermission() {
  if (!canNotify() || Notification.permission !== 'default') return
  try { await Notification.requestPermission() } catch { /* old Safari: callback API, ignore */ }
}

/** Show a notification if allowed; `onClick` runs when it's tapped. */
export function notify(title, body, { tag, onClick } = {}) {
  if (!canNotify() || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, { body, tag, icon: '/brand/zoot-badge-192.png' })
    n.onclick = () => {
      window.focus()
      onClick?.()
      n.close()
    }
  } catch { /* Android Chrome needs a service worker for this; the in-app banner still shows */ }
}
