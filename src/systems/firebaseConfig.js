/**
 * systems/firebaseConfig.js
 * Firebase 프로젝트 설정
 *
 * Realtime Database 보안 규칙 (Firebase 콘솔 → Realtime Database → 규칙):
 *   {
 *     "rules": {
 *       "presence":     { ".read": true, ".write": true },
 *       "chat":         { ".read": true, ".write": true },
 *       "joinRequests": { ".read": true, ".write": true }
 *     }
 *   }
 */

export const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyA4CHP76X_iSH4UNA7olxZ4_vSzpp16WKs',
  authDomain:        'virtual-cafe-b1a40.firebaseapp.com',
  databaseURL:       'https://virtual-cafe-b1a40-default-rtdb.firebaseio.com',
  projectId:         'virtual-cafe-b1a40',
  storageBucket:     'virtual-cafe-b1a40.firebasestorage.app',
  messagingSenderId: '485985333069',
  appId:             '1:485985333069:web:d3baccad86435429b61104',
  measurementId:     'G-BVR4Y6D4XL',
};

/** Firebase가 실제 값으로 설정되었는지 확인 */
export function isFirebaseConfigured() {
  return !FIREBASE_CONFIG.apiKey.startsWith('YOUR_');
}
