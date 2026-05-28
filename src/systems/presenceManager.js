/**
 * systems/presenceManager.js
 * 실제 유저 Presence 추적 — Firebase Realtime Database
 *
 * DB 경로: /presence/{scene}/{sessionId}
 *
 * - onDisconnect().remove(): 네트워크 단절/탭 강제 종료 시 서버에서 자동 삭제
 * - onValue(): 같은 씬의 모든 클라이언트(기기)에서 실시간 동기화
 * - pagehide/beforeunload: 정상 종료 즉시 반영
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref, set, remove, onValue,
  onDisconnect, serverTimestamp,
} from 'firebase/database';
import { FIREBASE_CONFIG, isFirebaseConfigured } from './firebaseConfig.js';
import { showNotification } from '../store/gameStore.js';

class PresenceManager {
  constructor() {
    this._db       = null;
    this._sid      = null;   // 이 세션의 고유 키
    this._myRef    = null;   // /presence/{scene}/{sid}
    this._unsub    = null;   // onValue 구독 해제 함수
    this._onChange = null;   // presence 변화 콜백
    this._allUsers = {};     // 현재 씬의 전체 presence 스냅샷
    this._myData   = null;   // 내 presence 데이터 (position 업데이트용)
    this._scene    = null;
  }

  // ── Firebase 초기화 ──────────────────────────────────────
  _initDB() {
    if (this._db) return true;
    if (!isFirebaseConfigured()) return false;
    try {
      const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
      this._db = getDatabase(app);
      return true;
    } catch (e) {
      console.error('[Presence] Firebase init error:', e);
      return false;
    }
  }

  /**
   * Presence 등록
   * @param {object} user   - 로그인 유저 (id, username, avatar, isGuest)
   * @param {string} scene  - 현재 씬 ('cafe' | 'airport' | 'park')
   * @param {function} onChange - presence 변화 시 호출될 콜백
   */
  join(user, scene, onChange) {
    if (!user || !scene) return;
    this._onChange = onChange;
    this._scene    = scene;
    // 같은 유저가 여러 탭 열어도 세션마다 별도 엔트리
    this._sid = `${user.id.replace(/[.#$/[\]]/g, '_')}_${Date.now()}`;

    if (!this._initDB()) {
      console.warn('[Presence] Firebase 미설정 — presence 비활성화');
      return;
    }

    this._myData = {
      userId:    user.id,
      username:  user.username,
      avatar:    user.avatar ?? {},
      isGuest:   user.isGuest  || false,
      tableId:   null,
      seatIndex: null,
    };

    this._myRef = ref(this._db, `presence/${scene}/${this._sid}`);

    // Firebase 연결 상태 모니터링
    const connRef = ref(this._db, '.info/connected');
    const connUnsub = onValue(connRef, snap => {
      if (snap.val() === true) {
        console.log('[Presence] Firebase 연결됨');
      } else {
        console.warn(
          '[Presence] Firebase 미연결 — databaseURL을 확인하세요:',
          FIREBASE_CONFIG.databaseURL,
        );
        showNotification(
          'Firebase 연결 실패 — Realtime Database URL 또는 보안 규칙을 확인하세요.',
          'info',
        );
      }
    });
    // 연결 감시는 최초 1회만 사용하고 해제
    setTimeout(() => connUnsub(), 10_000);

    // onDisconnect 먼저 등록 (네트워크 단절/크래시 시 서버에서 자동 삭제)
    onDisconnect(this._myRef).remove();

    // 내 presence 기록
    set(this._myRef, { ...this._myData, joinedAt: serverTimestamp() })
      .catch(err => {
        console.error('[Presence] presence 기록 실패:', err.message);
        showNotification('Firebase 쓰기 실패 — 보안 규칙을 확인하세요.', 'info');
      });

    // 씬 전체 presence 구독 (모든 기기 실시간 동기화)
    const sceneRef = ref(this._db, `presence/${scene}`);
    this._unsub = onValue(
      sceneRef,
      snap => {
        this._allUsers = snap.val() || {};
        this._onChange?.();
      },
      err => {
        console.error('[Presence] presence 읽기 실패:', err.message);
      },
    );

    // 정상 종료 시 즉시 삭제 (onDisconnect는 비정상 종료용)
    const cleanup = () => this.leave();
    window.addEventListener('pagehide',     cleanup, { once: true });
    window.addEventListener('beforeunload', cleanup, { once: true });
  }

  /** 내 테이블/좌석 위치 업데이트 */
  updatePosition(tableId, seatIndex) {
    if (!this._myRef || !this._myData) return;
    this._myData = { ...this._myData, tableId, seatIndex };
    set(this._myRef, { ...this._myData, joinedAt: serverTimestamp() });
  }

  /**
   * 현재 씬에 있는 다른 유저 목록 (본인 제외)
   */
  getOthers() {
    return Object.entries(this._allUsers)
      .filter(([sid]) => sid !== this._sid)
      .map(([, e]) => ({
        id:        e.userId,
        username:  e.username,
        avatar:    e.avatar    ?? {},
        tableId:   e.tableId   ?? null,
        seatIndex: e.seatIndex ?? null,
        isReal:    true,
        isGuest:   e.isGuest   || false,
      }));
  }

  /** 전체 접속자 수 (본인 포함) */
  getTotalCount() {
    return Object.keys(this._allUsers).length;
  }

  /** Presence 등록 해제 */
  leave() {
    this._unsub?.();
    this._unsub = null;

    if (this._myRef) {
      remove(this._myRef);
      this._myRef = null;
    }

    this._allUsers = {};
    this._myData   = null;
    this._onChange = null;
    this._scene    = null;
  }
}

export const presenceManager = new PresenceManager();
