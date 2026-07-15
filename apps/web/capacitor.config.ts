import type { CapacitorConfig } from '@capacitor/cli';

/** Device-test / LAN builds must allow mixed content so https WebView can use ws:// room server. */
const config: CapacitorConfig = {
  appId: 'com.gunnchos.beatlinkparty',
  appName: 'BeatLink Party',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
