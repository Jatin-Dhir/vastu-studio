import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.jatindhir.vastustudio',
  appName: 'Vastu Studio',
  webDir: 'dist',
  android: {
    backgroundColor: '#F3F1EA',
  },
  ios: {
    backgroundColor: '#F3F1EA',
    contentInset: 'never',
  },
}

export default config
