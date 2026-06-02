/**
 * systems/roomAllocator.js
 * 룸 샤딩 배정 — 한 방이 차면 새 방을 열고, 덜 찬 방부터 비우는 방식
 *
 * 기존 presence 구조 /presence/{scene}/{sid} 를 그대로 활용하되,
 * scene 을 'cafe' → 'cafe__room0', 'cafe__room1' … 으로 확장한다.
 *
 * 배정에 필요한 "방별 인원수"는 presence 전체를 읽지 않고
 * 가벼운 카운터 경로 /roomCounts/{base}/{roomId} 만 읽어서 판단한다.
 *   - 입장 시 transaction 으로 +1, 퇴장(onDisconnect 포함) 시 -1
 *   - 카운터는 배정 판단용 힌트일 뿐, 실제 좌석 점유의 정답은 presence 다.
 *
 * DB 경로
 *   /roomCounts/{base}/{roomId} = <number>     (예: /roomCounts/cafe/room0 = 14)
 *
 * 보안 규칙 (Realtime Database):
 *   "roomCounts": { ".read": true, ".write": true }
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getDatabase, ref, onValue, runTransaction,
} from 'firebase/database';
import { FIREBASE_CONFIG, isFirebaseConfigured } from './firebaseConfig.js';

// ── 설정 ──────────────────────────────────────────────────
export const ROOM_CONFIG = {
  capacity: 16,        // 방 정원 (시뮬레이터에서 고른 값)
  seatsPerTable: 4,    // multiplayerSim 의 SEATS_PER_TABLE 와 일치시킬 것
  // 방별 무드 — roomId 인덱스 순서대로 부여
  moods: [
    { id: 'room0', name: '1층 · 공용홀',   mood: '활기찬 큰 테이블', emoji: '☕' },
    { id: 'room1', name: '2층 · 창가',     mood: '조용한 1인석',     emoji: '🌇' },
    { id: 'room2', name: '다락방',         mood: '심야 집중 구역',   emoji: '🕯️' },
    { id: 'room3', name: '안뜰 테라스',    mood: '바람 드는 야외',   emoji: '🌿' },
    { id: 'room4', name: '지하 서고',      mood: '책에 둘러싸인',    emoji: '📚' },
    { id: 'room5', name: '별관 · 라운지',  mood: '느긋한 소파석',    emoji: '🛋️' },
  ],
  maxRooms: 6,
};

/** capacity 로부터 테이블 개수 산출 */
export function tableCountForRoom() {
  return Math.ceil(ROOM_CONFIG.capacity / ROOM_CONFIG.seatsPerTable);
}

/** base scene + roomId → presence scene 키 */
export function sceneKey(base, roomId) {
  return `${base}__${roomId}`;
}

/** scene 키 → 무드 메타 */
export function moodForRoom(roomId) {
  return ROOM_CONFIG.moods.find(m => m.id === roomId)
      || { id: roomId, name: roomId, mood: '', emoji: '🏠' };
}

class RoomAllocator {
  constructor() {
    this._db = null;
    this._base = null;          // 'cafe'
    this._roomId = null;        // 배정된 'room0' 등
    this._countsUnsub = null;
    this._myCountRef = null;
    this._counts = {};          // { room0: 14, room1: 3, ... }
  }

  _initDB() {
    if (this._db) return true;
    if (!isFirebaseConfigured()) return false;
    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    this._db = getDatabase(app);
    return true;
  }

  /**
   * 입장할 방을 "원자적으로" 예약한다. (정원 초과 레이스 차단)
   *   /roomCounts/{base}/{roomId} 를 트랜잭션으로 "정원 미달일 때만 +1".
   *   실패(만석)하면 다음 방으로 — 동시 입장에도 절대 정원을 넘지 않음.
   * @returns {Promise<{ scene, roomId, mood, slotRef }>}
   */
  async claimRoom(base) {
    this._base = base;
    if (!this._initDB()) {
      return { scene: sceneKey(base, 'room0'), roomId: 'room0', mood: moodForRoom('room0'), slotRef: null };
    }
    const { capacity, maxRooms } = ROOM_CONFIG;

    for (let i = 0; i < maxRooms; i++) {
      const rid = `room${i}`;
      const slotRef = ref(this._db, `roomCounts/${base}/${rid}`);
      let committed = false;
      try {
        const res = await runTransaction(slotRef, (n) => {
          n = n || 0;
          if (n >= capacity) return;   // 만석 → abort (undefined)
          return n + 1;                // 슬롯 원자 예약
        });
        committed = res.committed;
      } catch (e) {
        console.warn('[RoomAllocator] 슬롯 트랜잭션 실패:', e?.message);
        committed = false;
      }
      if (committed) {
        return { scene: sceneKey(base, rid), roomId: rid, mood: moodForRoom(rid), slotRef };
      }
    }

    // 전부 만석 → 마지막 방 오버플로 허용(그래도 +1 추적)
    const rid = `room${maxRooms - 1}`;
    const slotRef = ref(this._db, `roomCounts/${base}/${rid}`);
    await runTransaction(slotRef, (n) => (n || 0) + 1).catch(() => {});
    return { scene: sceneKey(base, rid), roomId: rid, mood: moodForRoom(rid), slotRef };
  }

  /** 예약 슬롯 반납 (정상 퇴장/가짜 제거) */
  async releaseSlot(slotRef) {
    if (!slotRef) return;
    try { await runTransaction(slotRef, (n) => Math.max(0, (n || 0) - 1)); } catch {}
  }

  /** 드리프트 보정 — 주어진 슬롯 카운터를 실제 인원으로 끌어내림(고스트 제거) */
  reconcileSlot(slotRef, realCount) {
    if (!slotRef || typeof realCount !== 'number') return;
    runTransaction(slotRef, (n) => {
      const c = n || 0;
      if (c - realCount >= 2) return realCount;  // 2 이상 벌어지면 실제값으로
      return;   // 변경 없음 → abort (쓰기 발생 안 함)
    }).catch(() => {});
  }

  /**
   * 방별 카운트 실시간 구독 (UI 표시·디버그용)
   * @param {function(Object)} cb - { room0: n, ... }
   */
  watchCounts(base, cb) {
    if (!this._initDB()) { cb({}); return () => {}; }
    const r = ref(this._db, `roomCounts/${base}`);
    this._countsUnsub = onValue(r, snap => {
      this._counts = snap.val() || {};
      cb(this._counts);
    });
    return () => { this._countsUnsub?.(); this._countsUnsub = null; };
  }

  /** 구독 정리 (선택) */
  leave() {
    this._countsUnsub?.();
    this._countsUnsub = null;
  }

  get currentRoomId() { return this._roomId; }
  get counts() { return this._counts; }
}

export const roomAllocator = new RoomAllocator();
