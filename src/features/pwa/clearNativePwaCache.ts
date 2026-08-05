import { Capacitor } from '@capacitor/core'

export async function clearNativePwaCache() {
  if (!Capacitor.isNativePlatform()) return

  try {
    const registrations = await navigator.serviceWorker?.getRegistrations()
    await Promise.all((registrations ?? []).map((registration) => registration.unregister()))

    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter((name) => /workbox|precache|pwa/i.test(name))
          .map((name) => caches.delete(name)),
      )
    }
  } catch (error) {
    console.warn('Unable to remove the old native PWA cache.', error)
  }
}
