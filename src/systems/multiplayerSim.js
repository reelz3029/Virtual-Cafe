/**
 * systems/multiplayerSim.js
 * 실시간 멀티플레이어 — Firebase Realtime Database
 *
 * [봇 제거, 실제 유저로 대체]
 * - Presence: /presence/{scene}/{sessionId}
 * - 채팅:     /chat/{scene}/{messageId}
 * - 합석요청: /joinRequests/{targetUserId}/{requestId}
 *
 * Firebase 미설정 시: presence/채팅 비활성화 + 경고 표시
 */

import { nanoid } from 'nanoid';
import {
  store,
  setOnlineUsers,
  addChatMessage,
  setChatMessages,
  showNotification,
} from '../store/gameStore.js';
import { presenceManager }                from './presenceManager.js';
import { isFirebaseConfigured, FIREBASE_CONFIG } from './firebaseConfig.js';
import { getApp, getApps, initializeApp }  from 'firebase/app';
import {
  getDatabase,
  ref, push, remove,
  onValue, onChildAdded,
  serverTimestamp, query, limitToLast,
} from 'firebase/database';

// ── Firebase DB 인스턴스 (설정된 경우만) ─────────────────
function getDB() {
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  return getDatabase(app);
}

// ── 멀티플레이어 클래스 ──────────────────────────────────
class MultiplayerSim {
  constructor() {
    this._running   = false;
    this._scene     = null;
    this._chatUnsub = null;
    this._reqUnsub  = null;
  }

  /**
   * 멀티플레이어 시작
   * @param {number} tableCount  - 테이블 수 (씬 구성용)
   * @param {string} scene       - 씬 이름 ('cafe' | 'airport' | 'park')
   */
  start(tableCount = 8, scene = 'cafe') {
    if (this._running) this.stop();
    this._running = true;
    this._scene   = scene;

    const { auth } = store.getState();
    if (!auth.user) return;

    // 1. Presence 등록 (다른 유저 변화 시 _syncUsers 재호출)
    presenceManager.join(auth.user, scene, () => this._syncUsers());

    if (!isFirebaseConfigured()) {
      showNotification(
        'Firebase 미설정 — firebaseConfig.js를 채워주세요. 현재는 혼자만 보입니다.',
        'info',
      );
      this._syncUsers();
      return;
    }

    const db = getDB();

    // 2. 채팅 구독 — 씬별 최근 50개 메시지 실시간 동기화
    const chatRef = query(ref(db, `chat/${scene}`), limitToLast(50));
    this._chatUnsub = onValue(chatRef, snap => {
      const msgs = [];
      snap.forEach(child => {
        msgs.push({ id: child.key, ...child.val() });
      });
      setChatMessages(msgs);
    });

    // 3. 합석 요청 수신 (내 userId 경로 감시)
    const safeMyId = auth.user.id.replace(/[.#$/[\]]/g, '_');
    const reqRef   = ref(db, `joinRequests/${safeMyId}`);
    this._reqUnsub = onChildAdded(reqRef, snap => {
      const req = snap.val();
      if (!req) return;
      store.setState(s => ({
        joinRequests: [...s.joinRequests, { _key: snap.key, ...req }],
        ui: { ...s.ui, showJoinRequest: true },
      }));
      // 5분 후 자동 삭제
      setTimeout(() => remove(snap.ref), 5 * 60_000);
    });

    this._syncUsers();
  }

  /** 멀티플레이어 중지 */
  stop() {
    this._running = false;
    this._chatUnsub?.();
    this._reqUnsub?.();
    this._chatUnsub = null;
    this._reqUnsub  = null;
    presenceManager.leave();
    setOnlineUsers([]);
    setChatMessages([]);
  }

  /** 착석 후 내 위치를 presence에 반영 */
  refreshMyPosition() {
    const { myTableId, mySeatIndex } = store.getState();
    presenceManager.updatePosition(myTableId, mySeatIndex);
    this._syncUsers();
  }

  /**
   * 채팅 메시지 전송 — Firebase에 push
   * @param {string} text
   */
  sendChat(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    const { auth, myTableId } = store.getState();
    const user = auth.user;
    if (!user) return;

    if (!isFirebaseConfigured()) {
      // Firebase 미설정 시 로컬에만 표시
      addChatMessage({
        id:         nanoid(8),
        from:       user.id,
        fromName:   user.username,
        fromAvatar: user.avatar,
        text:       trimmed,
        timestamp:  Date.now(),
        tableId:    myTableId ?? null,
      });
      return;
    }

    push(ref(getDB(), `chat/${this._scene}`), {
      from:       user.id,
      fromName:   user.username,
      fromAvatar: user.avatar ?? {},
      text:       trimmed,
      timestamp:  serverTimestamp(),
      tableId:    myTableId ?? null,
    });
  }

  /**
   * 합석 요청 전송 — 대상 유저의 joinRequests 경로에 push
   * @param {string} targetUserId
   * @param {string} tableId
   */
  requestJoin(targetUserId, tableId) {
    const { auth } = store.getState();
    const me = auth.user;
    if (!me) return;

    if (!isFirebaseConfigured()) {
      showNotification('합석 기능은 Firebase 설정 후 이용할 수 있어요.', 'info');
      return;
    }

    const safeId = targetUserId.replace(/[.#$/[\]]/g, '_');
    push(ref(getDB(), `joinRequests/${safeId}`), {
      fromId:     me.id,
      fromName:   me.username,
      fromAvatar: me.avatar ?? {},
      tableId:    tableId ?? null,
      timestamp:  serverTimestamp(),
    });
    showNotification('합석 요청을 보냈어요! 🙏', 'info');
  }

  /** bots 호환 getter (봇 없음) */
  get bots() { return []; }

  // ── 내부 ─────────────────────────────────────────────────
  _syncUsers() {
    const { auth, myTableId, mySeatIndex } = store.getState();
    const myUser = auth.user;
    const others = presenceManager.getOthers();
    const all    = [...others];

    if (myUser) {
      all.push({
        id:        myUser.id,
        username:  myUser.username,
        avatar:    myUser.avatar,
        tableId:   myTableId  ?? null,
        seatIndex: mySeatIndex ?? null,
        isMe:      true,
      });
    }

    setOnlineUsers(all);
  }
}

export const multiplayerSim = new MultiplayerSim();
