import * as Location from 'expo-location';

export type Fix = { latitude: number; longitude: number; accuracy: number | null }

export async function getFix(timeoutMs = 12000): Promise<Fix | null> {
  const perm = await Location.getForegroundPermissionsAsync()
  if (!perm.granted) return null

  const enabled = await Location.hasServicesEnabledAsync()
  if (!enabled) throw new Error('LOCATION_OFF')

  const attempt = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  })
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))

  const pos = await Promise.race([attempt, timeout])
  if (!pos) {
    // Fall back to whatever the OS already had cached.
    const last = await Location.getLastKnownPositionAsync({ maxAge: 120000 })
    if (!last) return null
    return {
      latitude: last.coords.latitude,
      longitude: last.coords.longitude,
      accuracy: last.coords.accuracy,
    }
  }
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  }
}