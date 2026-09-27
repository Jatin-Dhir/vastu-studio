import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.jatindhir.vastustudio',
  appName: 'Vastu Studio',
  webDir: 'dist',
  android: {
    backgroundColor: '#F3F1EA',
    // the web bundle targets Chrome 99; an older, never-updated WebView would load it and fail
    // to parse it — show webview-update.html instead
    minWebViewVersion: 99,
  },
  server: {
    errorPath: 'webview-update.html',
  },
  ios: {
    backgroundColor: '#F3F1EA',
    contentInset: 'never',
  },
}

export default config
