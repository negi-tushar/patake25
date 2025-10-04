import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { getFunctions, provideFunctions } from '@angular/fire/functions';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() =>
      initializeApp({
        projectId: 'patake25',
        appId: '1:430052944181:web:a1cf092cece66d93b2447c',
        storageBucket: 'patake25.firebasestorage.app',
        apiKey: 'AIzaSyAlzouNimuBeTGh_bCC4MCu9yVMKiPXwxc',
        authDomain: 'patake25.firebaseapp.com',
        messagingSenderId: '430052944181',
        // projectNumber: '430052944181',
        // version: '2',
      })
    ),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideDatabase(() => getDatabase()),
    provideFunctions(() => getFunctions()),
  ],
};
