/**
 * systems/roomAllocator.js
 * 룸/인스턴스 샤딩 — "한 방을 무한히 키우기"가 아니라 "적당한 방 여러 개"
 *
 * 정원이 정해진 룸(cafe_room1, cafe_room2, …)을 Firebase presence 인원수로
 * 판단해 채워나가는 순서로 배정한다. 빈 방 썰렁함을 줄이기 위해
 * "앞 방이 거의 찰 때만 다음 방을 연다".
 *
 * presence 경로: /presence/{base}_room{N}/{sessionId}
 */

import { isFirebaseConfigured, FIREBASE_CONFIG } from './firebaseConfig.js';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';

const MAX_ROOMS = 50;       // 안전 상한
const OPEN_NEW_RATIO = 0.85; // 앞 방이 85% 이상 차야 새 방을 연다

function getDB() {
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  return getDatabase(app);
}

/** 특정 룸의 현재 접속자 수 */
async function roomCount(db, scene) {
  try {
    const snap = await get(ref(db, `presence/${scene}`));
    return snap.exists() ? snap.size : 0;
  } catch {
    return 0;
  }
}

class RoomAllocator {
  /**
   * 입장할 룸을 결정한다.
   * @param {string} base     - 베이스 씬 이름 ('cafe')
   * @param {number} capacity - 룸 1개 정원 (예: 32)
   * @returns {Promise<string>} 배정된 룸 씬 id (예: 'cafe_room1')
   */
  async allocateRoom(base = 'cafe', capacity = 32) {
    // Firebase 미설정 → 단일 룸
    if (!isFirebaseConfigured()) return `${base}_room1`;

    const db = getDB();
    const openThreshold = Math.floor(capacity * OPEN_NEW_RATIO);

    for (let n = 1; n <= MAX_ROOMS; n++) {
      const scene = `${base}_room${n}`;
      const count = await roomCount(db, scene);

      // 정원 미만이면서, (1번 방이거나 / 빈 자리가 있는) 방에 배정
      if (count < capacity) {
        // 다음 방을 새로 여는 건 현재 방이 충분히 찼을 때만.
        // → 거의 빈 방이 여러 개 흩어지는 걸 방지 (썰렁함 완충)
        if (count < openThreshold || n === MAX_ROOMS) {
          return scene;
        }
        // count가 openThreshold~capacity 사이면: 이 방도 받을 수 있지만
        // 다음 방도 확인해 더 빈 방이 있으면 그쪽으로 — 단, 없으면 이 방.
        const nextCount = await roomCount(db, `${base}_room${n + 1}`);
        if (nextCount === 0) return scene; // 다음 방은 아직 안 열림 → 이 방 마저 채움
        // 다음 방이 이미 열려있으면 루프가 다음 n에서 판단
      }
    }
    return `${base}_room1`;
  }

  /** 룸 id → 사람이 읽는 라벨 */
  labelFor(scene) {
    const m = /_room(\d+)$/.exec(scene || '');
    return m ? `${m[1]}번 방` : '카페';
  }
}

export const roomAllocator = new RoomAllocator();
