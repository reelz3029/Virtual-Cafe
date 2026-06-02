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
import { roomAllocator } from './roomAllocator.js';

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
    this._mySlotRef = null;  // 내 방 예약 슬롯 카운터 ref
    this._fakeSids = [];     // 디버그용 가짜 손님 [{sid, scene, slotRef}]
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
   * Presence 등록 — base('cafe')를 받아 정원 미달 방을 원자적으로 예약 후 입장
   * @param {object} user   - 로그인 유저 (id, username, avatar, isGuest)
   * @param {string} base   - 베이스 씬 ('cafe')
   * @param {function} onChange - presence 변화 시 호출될 콜백
   * @returns {Promise<{scene, mood}>}
   */
  async join(user, base, onChange) {
    if (!user || !base) return null;
    this._onChange = onChange;
    // 같은 유저가 여러 탭 열어도 세션마다 별도 엔트리
    this._sid = `${user.id.replace(/[.#$/[\]]/g, '_')}_${Date.now()}`;

    if (!this._initDB()) {
      console.warn('[Presence] Firebase 미설정 — presence 비활성화');
      this._scene = `${base}__room0`;
      return { scene: this._scene, mood: roomAllocator.moodForRoom?.('room0') ?? null };
    }

    this._myData = {
      userId:    user.id,
      username:  user.username,
      avatar:    user.avatar ?? {},
      isGuest:   user.isGuest  || false,
      tableId:   null,
      seatIndex: null,
    };

    // 원자적 방 예약 (정원 초과 레이스 차단)
    const claim = await roomAllocator.claimRoom(base);
    this._scene = claim.scene;
    this._mySlotRef = claim.slotRef;
    this._myRef = ref(this._db, `presence/${this._scene}/${this._sid}`);

    // Firebase 연결 상태 모니터링
    // .info/connected 는 초기화 시 항상 false를 먼저 방출하므로
    // "연결됨"을 한 번이라도 확인한 뒤에만 끊김 판정
    let hasConnected = false;
    const noConnTimer = setTimeout(() => {
      if (!hasConnected) {
        console.warn('[Presence] Firebase 연결 타임아웃 — databaseURL:', FIREBASE_CONFIG.databaseURL);
        showNotification('Firebase 연결 실패 — Realtime Database URL 또는 보안 규칙을 확인하세요.', 'info');
      }
    }, 8_000); // 8초 안에 연결 안되면 실패로 간주

    const connRef = ref(this._db, '.info/connected');
    const connUnsub = onValue(connRef, snap => {
      if (snap.val() === true) {
        hasConnected = true;
        clearTimeout(noConnTimer);
        console.log('[Presence] Firebase 연결됨');
      } else if (hasConnected) {
        // 한번 연결된 뒤 끊긴 경우만 경고 (초기 false는 무시)
        console.warn('[Presence] Firebase 연결 끊김');
      }
    });
    setTimeout(() => connUnsub(), 15_000);

    // onDisconnect 먼저 등록 (네트워크 단절/크래시 시 서버에서 자동 삭제)
    onDisconnect(this._myRef).remove();

    // 내 presence 기록
    set(this._myRef, { ...this._myData, joinedAt: serverTimestamp() })
      .catch(err => {
        console.error('[Presence] presence 기록 실패:', err.message);
        showNotification('Firebase 쓰기 실패 — 보안 규칙을 확인하세요.', 'info');
      });

    // 방 전체 presence 구독 (모든 기기 실시간 동기화)
    const sceneRef = ref(this._db, `presence/${this._scene}`);
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

    return { scene: this._scene, mood: claim.mood };
  }

  /** 내 테이블/좌석 위치 업데이트 */
  updatePosition(tableId, seatIndex) {
    if (!this._myRef || !this._myData) return;
    this._myData = { ...this._myData, tableId, seatIndex };
    set(this._myRef, { ...this._myData, joinedAt: serverTimestamp() });
  }

  /** 내 캐릭터 바라보는 방향(yaw) 갱신 — 호출 측에서 쓰로틀할 것 */
  setFacing(yaw) {
    if (!this._myRef || !this._myData) return;
    this._myData = { ...this._myData, yaw };
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
        yaw:       typeof e.yaw === 'number' ? e.yaw : null,
        isReal:    true,
        isGuest:   e.isGuest   || false,
      }));
  }

  /** 전체 접속자 수 (본인 포함, 가짜 포함) */
  getTotalCount() {
    return Object.keys(this._allUsers).length;
  }

  /** 내 예약 슬롯 드리프트 보정 (onChange 콜백에서 호출) — 5초 쓰로틀 */
  reconcileSlot() {
    const now = Date.now();
    if (now - (this._lastReconcile || 0) < 5000) return;
    this._lastReconcile = now;
    roomAllocator.reconcileSlot(this._mySlotRef, this.getTotalCount());
  }

  // ── 디버그: 가짜 손님을 실제 presence 엔트리로 등록 ──────────
  //   claimRoom 으로 슬롯을 원자 예약(꽉 차면 다음 방) → 룸 샤딩까지 테스트
  async addFakePresence(name = '손님') {
    if (!this._db || !this._scene) return null;
    const base  = this._scene.split('__')[0];                 // 'cafe'
    const claim = await roomAllocator.claimRoom(base);        // 슬롯 원자 예약
    const sid   = `fake_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const fRef  = ref(this._db, `presence/${claim.scene}/${sid}`);
    onDisconnect(fRef).remove();   // 이 탭이 닫히면 자동 정리
    set(fRef, {
      userId: sid, username: name, avatar: {}, isGuest: true, isFake: true,
      tableId: null, seatIndex: null,
      yaw: (Math.random() * 2 - 1) * 1.3,
      joinedAt: serverTimestamp(),
    });
    this._fakeSids.push({ sid, scene: claim.scene, slotRef: claim.slotRef });
    return sid;
  }

  /** 마지막 가짜 손님 제거 (엔트리 삭제 + 슬롯 반납) */
  removeFakePresence() {
    const f = this._fakeSids.pop();
    if (f && this._db) {
      remove(ref(this._db, `presence/${f.scene}/${f.sid}`));
      roomAllocator.releaseSlot(f.slotRef);
    }
  }

  getFakeCount() { return this._fakeSids.length; }

  _clearFakes() {
    if (this._db) {
      this._fakeSids.forEach(f => {
        remove(ref(this._db, `presence/${f.scene}/${f.sid}`));
        roomAllocator.releaseSlot(f.slotRef);
      });
    }
    this._fakeSids = [];
  }

  /** Presence 등록 해제 */
  leave() {
    this._clearFakes();   // 가짜 손님 먼저 정리

    this._unsub?.();
    this._unsub = null;

    if (this._myRef) {
      remove(this._myRef);
      this._myRef = null;
    }
    // 내 예약 슬롯 반납
    roomAllocator.releaseSlot(this._mySlotRef);
    this._mySlotRef = null;

    this._allUsers = {};
    this._myData   = null;
    this._onChange = null;
    this._scene    = null;
  }
}

export const presenceManager = new PresenceManager();
