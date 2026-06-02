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
  getDatabase, ref, onValue, get,
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
   * 입장할 방을 결정하고 카운터를 +1 한다.
   * @param {string} base  - 'cafe'
   * @returns {Promise<{ roomId, scene, mood }>}
   */
  async allocate(base) {
    this._base = base;

    // Firebase 미설정: 단일 방으로 폴백
    if (!this._initDB()) {
      this._roomId = 'room0';
      return { roomId: 'room0', scene: sceneKey(base, 'room0'), mood: moodForRoom('room0') };
    }

    // 실제 presence 인원으로 "채우기 우선" 방 선택 (수동 카운터 미사용 → 드리프트 없음)
    const chosen = await this._pickRoom(base);
    this._roomId = chosen;
    return { roomId: chosen, scene: sceneKey(base, chosen), mood: moodForRoom(chosen) };
  }

  /** 같은 base 에서 정원 미달인 가장 앞 방의 scene 키 (가짜 손님 배정 등에 재사용) */
  async pickRoomScene(base) {
    if (!this._initDB()) return sceneKey(base, 'room0');
    return sceneKey(base, await this._pickRoom(base));
  }

  /** 정원 미달인 가장 앞 방 id (room0→room1→…) — 실제 presence 수 기준 */
  async _pickRoom(base) {
    const { capacity, maxRooms } = ROOM_CONFIG;
    for (let i = 0; i < maxRooms; i++) {
      const rid = `room${i}`;
      const n = await this._roomOccupancy(sceneKey(base, rid));
      this._counts[rid] = n;
      if (n < capacity) return rid;
    }
    return `room${maxRooms - 1}`;   // 전부 만석 → 마지막 방 오버플로
  }

  /** 특정 방(scene)의 실제 presence 인원 */
  async _roomOccupancy(scene) {
    try {
      const snap = await get(ref(this._db, `presence/${scene}`));
      return snap.exists() ? (snap.size || 0) : 0;
    } catch {
      return 0;
    }
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

  /** (구) 카운터 보정 — 이제 실제 presence 인원으로 직접 배정하므로 불필요(no-op) */
  reconcile() { /* presence 직접 카운트 방식이라 보정 불필요 */ }

  /** 퇴장 — presence 는 presenceManager 가 정리, 여기선 상태만 초기화 */
  leave() {
    this._countsUnsub?.();
    this._countsUnsub = null;
    this._roomId = null;
  }

  get currentRoomId() { return this._roomId; }
  get counts() { return this._counts; }
}

export const roomAllocator = new RoomAllocator();
