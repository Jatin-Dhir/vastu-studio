import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.jatindhir.vastustudio',
  appName: 'Vastu Studio',
  webDir: 'dist',
  android: {
    backgroundColor: '#0B0C10',
  },
  ios: {
    backgroundColor: '#0B0C10',
    contentInset: 'never',
  },
}

export default config
