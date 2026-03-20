// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  ssr: false,
  spaLoadingTemplate: false,
  runtimeConfig: {
    // Electron sets NUXT_CHART_DATA_FILE at runtime (see electron/main.cjs). CLI/hosting can use CHART_DATA_FILE.
    chartDataFile:
      process.env.NUXT_CHART_DATA_FILE || process.env.CHART_DATA_FILE || `${process.cwd()}/data/chart.json`,
    public: {
      chartStorageMode: process.env.NUXT_PUBLIC_CHART_STORAGE_MODE || 'auto',
      firebaseApiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY || '',
      firebaseAuthDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
      firebaseProjectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || '',
      firebaseStorageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
      firebaseMessagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
      firebaseAppId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID || '',
      /** App password. If set, app shows a password gate before the chart. */
      appPassword: process.env.NUXT_PUBLIC_APP_PASSWORD || ''
    }
  },
  app: {
    head: {
      title: 'Affylo',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Arvo:ital,wght@0,400;0,700&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&display=swap' }
      ]
    }
  },
  css: ['~/assets/css/main.css']
})
