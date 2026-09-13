import { useCameraPermissions } from 'expo-camera'
import * as Location from 'expo-location'
import { useEffect, useState } from 'react'

export function usePunchPermissions() {
  const [camera, requestCamera] = useCameraPermissions()
  const [location, setLocation] = useState<boolean | null>(null)

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((r) => setLocation(r.granted))
  }, [])

  async function requestAll() {
    const cam = camera?.granted ? camera : await requestCamera()
    const loc = await Location.requestForegroundPermissionsAsync()
    setLocation(loc.granted)
    return { camera: !!cam?.granted, location: loc.granted }
  }

  return {
    cameraGranted: !!camera?.granted,
    locationGranted: location,
    ready: camera !== null && location !== null,
    requestAll,
  }
}