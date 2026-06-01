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
  getDatabase, ref, onValue, runTransaction, get,
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

    // 1. 현재 방별 카운트 스냅샷 읽기
    //    roomCounts 보안 규칙이 없거나 네트워크 오류면 permission-denied 등으로
    //    throw → 단일 방(room0)으로 폴백해 입장 자체는 깨지지 않게 한다.
    try {
      const snap = await get(ref(this._db, `roomCounts/${base}`));
      this._counts = snap.val() || {};
    } catch (e) {
      console.warn('[RoomAllocator] roomCounts 읽기 실패 — 단일 방 폴백:', e?.message);
      this._roomId = 'room0';
      return { roomId: 'room0', scene: sceneKey(base, 'room0'), mood: moodForRoom('room0') };
    }

    // 2. "채우기 우선" — 안 꽉 찬 방 중 가장 많이 찬 방
    const chosen = this._pickRoom();

    // 3. 카운터 +1 (transaction 으로 경쟁 방지) — 실패해도 입장은 진행
    this._roomId = chosen;
    this._myCountRef = ref(this._db, `roomCounts/${base}/${chosen}`);
    try {
      await runTransaction(this._myCountRef, cur => (cur || 0) + 1);
    } catch (e) {
      console.warn('[RoomAllocator] 카운터 +1 실패 (무시):', e?.message);
      this._myCountRef = null;
    }

    // 4. 비정상 종료 보정: onDisconnect 트랜잭션이 불가하므로 호출하지 않는다.
    //    (set(undefined)/null ref 는 동기 예외 → allocate 가 죽어 presence 등록까지
    //     막혔던 버그.) 카운터 드리프트는 _syncUsers 의 reconcile() 셀프 힐링으로 수렴.

    return {
      roomId: chosen,
      scene: sceneKey(base, chosen),
      mood: moodForRoom(chosen),
    };
  }

  /** 안 꽉 찬 방 중 가장 많이 찬 방 선택, 없으면 새 방 */
  _pickRoom() {
    const { capacity, maxRooms } = ROOM_CONFIG;
    const candidates = [];
    for (let i = 0; i < maxRooms; i++) {
      const rid = `room${i}`;
      const n = this._counts[rid] || 0;
      if (n < capacity) candidates.push({ rid, n });
    }
    if (!candidates.length) {
      // 전부 만석 — 마지막 방에 오버플로 (정원 약간 초과 허용)
      return `room${maxRooms - 1}`;
    }
    // 가장 많이 찬(=n이 큰) 방부터. 단 0인 방이 여러 개면 가장 앞 방.
    candidates.sort((a, b) => b.n - a.n);
    // 모든 후보가 0명이면 room0 (가장 앞)
    if (candidates.every(c => c.n === 0)) return 'room0';
    return candidates[0].rid;
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

  /**
   * 셀프 힐링 — 내 방의 실제 presence 인원으로 카운터를 보정한다.
   * presenceManager 의 onValue 콜백(모든 기기에서 호출됨)에서 주기적으로 부르면,
   * onDisconnect 트랜잭션 한계로 생기는 고스트 +1 드리프트가 자연히 수렴한다.
   *
   * @param {number} realCount - presenceManager.getTotalCount() 결과
   */
  reconcile(realCount) {
    if (!this._db || !this._base || !this._roomId) return;
    if (typeof realCount !== 'number') return;

    const ref_ = ref(this._db, `roomCounts/${this._base}/${this._roomId}`);
    // 카운터가 실제보다 크게 벌어졌을 때만 보정 (쓰기 경쟁 최소화)
    // 규칙 미설정 등으로 거부돼도 조용히 무시 (입장/착석에는 영향 없음)
    runTransaction(ref_, cur => {
      const c = cur || 0;
      if (Math.abs(c - realCount) >= 2) return realCount;
      return cur;
    }).catch(() => {});
  }

  /** 퇴장 — 카운터 -1 */
  async leave() {
    if (this._myCountRef) {
      const r = this._myCountRef;
      this._myCountRef = null;
      try { await runTransaction(r, cur => Math.max(0, (cur || 0) - 1)); } catch {}
    }
    this._countsUnsub?.();
    this._countsUnsub = null;
    this._roomId = null;
  }

  get currentRoomId() { return this._roomId; }
  get counts() { return this._counts; }
}

export const roomAllocator = new RoomAllocator();
