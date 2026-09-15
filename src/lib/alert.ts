import { Alert, Platform } from 'react-native'

export type AlertButton = {
  text: string
  onPress?: () => void
  style?: 'default' | 'cancel' | 'destructive'
}

/**
 * Alert.alert is a no-op on react-native-web, so every confirm dialog
 * silently does nothing there. This falls back to the browser dialogs.
 */
export function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons as any)
    return
  }

  const body = message ? `${title}\n\n${message}` : title

  if (!buttons || buttons.length === 0) {
    window.alert(body)
    return
  }

  if (buttons.length === 1) {
    window.alert(body)
    buttons[0].onPress?.()
    return
  }

  const confirmBtn =
    buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1]
  const cancelBtn = buttons.find((b) => b.style === 'cancel')

  if (window.confirm(body)) confirmBtn.onPress?.()
  else cancelBtn?.onPress?.()
}