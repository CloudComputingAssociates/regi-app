// src/environments/environment.prod.ts
// Production environment configuration
export const environment = {
  production: true,
  apiUrl: 'https://api.regimenu.net/api',
  imageApiUrl: 'https://api.regimenu.net',
  mealsetsUrl: 'https://mealsets.regimenu.com', // public MealSets marketplace (separate origin)
  // Camera-over-tether ("Take it with my phone"). API command channel is live; the
  // button shows and is enabled only when a phone is tethered (tether anyLive).
  phoneCaptureEnabled: true,
  auth0: {
    domain: 'dev-sj1bmj8255bwte7r.us.auth0.com',
    clientId: '9KHWGCfSSg9wUr1oREiUYIgP15EDIppJ',
    audience: 'https://api.regimenu.net'  // <-- Changed from yehapi
  }
};