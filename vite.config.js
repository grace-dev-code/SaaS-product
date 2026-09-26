import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        login: 'login.html',
        vehicles: 'vehicles.html',
        carInformation: 'car-information.html',
        dashboard: 'dashboard.html',
        serviceRecords: 'service-records.html',
      },
    },
  },
});
