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
  setTableChatMessages,
  setSeat,
  setRoomMood,
  resolveJoinRequest,
  showNotification,
} from '../store/gameStore.js';
import { presenceManager }                from './presenceManager.js';
import { roomAllocator }                  from './roomAllocator.js';
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
const SEATS_PER_TABLE = 4;

class MultiplayerSim {
  constructor() {
    this._running          = false;
    this._scene            = null;
    this._tableCount       = 0;
    this._chatUnsub        = null;
    this._reqUnsub         = null;
    this._resultUnsub      = null;
    this._tableChatUnsub   = null;
    this._subscribedTblId  = null;
    this._autoSitTimer     = null;
  }

  /**
   * 멀티플레이어 시작
   * @param {number} tableCount  - 테이블 수 (씬 구성용)
   * @param {string} scene       - 씬 이름 ('cafe' | 'airport' | 'park')
   */
  async start(tableCount = 8, scene = 'cafe') {
    if (this._running) this.stop();
    this._running    = true;
    this._tableCount = tableCount;

    const { auth } = store.getState();
    if (!auth.user) { this._running = false; return; }

    // 0. 룸 샤딩 — 채우기 우선으로 입장할 방 배정 (roomCounts 카운터 +1)
    const { scene: roomScene, mood } = await roomAllocator.allocate(scene);
    if (!this._running) return;   // await 중 stop() 호출됐으면 중단
    this._scene = roomScene;
    setRoomMood(mood);

    // 1. Presence 등록 (다른 유저 변화 시 _syncUsers 재호출)
    presenceManager.join(auth.user, roomScene, () => this._syncUsers());

    // Firebase 초기 데이터 도착 후 자동 착석 (1.5초 대기)
    this._autoSitTimer = setTimeout(() => this._autoSit(), 1500);

    if (!isFirebaseConfigured()) {
      showNotification(
        'Firebase 미설정 — firebaseConfig.js를 채워주세요. 현재는 혼자만 보입니다.',
        'info',
      );
      this._syncUsers();
      return;
    }

    const db = getDB();

    // 2. 채팅 구독 — 룸별 최근 50개 메시지 실시간 동기화
    const chatRef = query(ref(db, `chat/${this._scene}`), limitToLast(50));
    this._chatUnsub = onValue(chatRef, snap => {
      const msgs = [];
      snap.forEach(child => {
        msgs.push({ id: child.key, ...child.val() });
      });
      setChatMessages(msgs);
    });

    const safeMyId = auth.user.id.replace(/[.#$/[\]]/g, '_');

    // 3. 합석 요청 수신 (내 userId 경로 감시)
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

    // 4. 합석 결과 수신 — 수락/거절 피드백
    const resultRef    = ref(db, `joinResults/${safeMyId}`);
    this._resultUnsub  = onChildAdded(resultRef, snap => {
      const result = snap.val();
      remove(snap.ref); // 읽은 즉시 삭제
      if (!result) return;

      if (result.accepted) {
        // 이미 해당 테이블에 착석 중이면 무시 (복수 수락 중복 방지)
        const { myTableId } = store.getState();
        if (myTableId === result.tableId) return;
        setSeat(result.tableId, result.seatIndex);
        this.refreshMyPosition();
        showNotification('합석이 수락됐어요! 같은 테이블이에요 🎉', 'success');
      } else {
        showNotification('합석 요청이 거절됐어요 😢', 'info');
      }
    });

    this._syncUsers();
  }

  /** 멀티플레이어 중지 */
  stop() {
    this._running = false;
    clearTimeout(this._autoSitTimer);
    this._autoSitTimer = null;
    this._chatUnsub?.();
    this._reqUnsub?.();
    this._resultUnsub?.();
    this._tableChatUnsub?.();
    this._chatUnsub       = null;
    this._reqUnsub        = null;
    this._resultUnsub     = null;
    this._tableChatUnsub  = null;
    this._subscribedTblId = null;
    presenceManager.leave();
    roomAllocator.leave();          // roomCounts 카운터 -1
    setOnlineUsers([]);
    setChatMessages([]);
    setTableChatMessages([]);
    setRoomMood(null);
    store.setState({ myTableId: null, mySeatIndex: null });
  }

  /** 착석 후 내 위치를 presence에 반영 */
  refreshMyPosition() {
    const { myTableId, mySeatIndex } = store.getState();
    presenceManager.updatePosition(myTableId, mySeatIndex);
    this._subscribeTableChat(myTableId);
    this._syncUsers();
  }

  /** 테이블 나가기 — 다른 테이블의 빈 자리로 이동 */
  leaveTable() {
    const { myTableId } = store.getState();
    if (!myTableId) return;

    const takenSeats = new Set(
      presenceManager.getOthers()
        .filter(u => u.tableId != null)
        .map(u => `${u.tableId}_${u.seatIndex}`),
    );

    const available = [];
    for (let t = 0; t < this._tableCount; t++) {
      const tid = `table_${t}`;
      if (tid === myTableId) continue; // 현재 테이블 제외
      for (let s = 0; s < SEATS_PER_TABLE; s++) {
        if (!takenSeats.has(`${tid}_${s}`)) {
          available.push({ tableId: tid, seatIndex: s });
        }
      }
    }

    if (!available.length) {
      showNotification('다른 테이블에 빈 자리가 없어요 😅', 'info');
      return;
    }

    const chosen = available[Math.floor(Math.random() * available.length)];
    setSeat(chosen.tableId, chosen.seatIndex);
    this.refreshMyPosition();
    showNotification('다른 자리로 이동했어요 ☕', 'success');
  }

  /** 합석 채팅 구독 — 테이블별 실시간 메시지 */
  _subscribeTableChat(tableId) {
    if (this._subscribedTblId === tableId) return;

    this._tableChatUnsub?.();
    this._tableChatUnsub  = null;
    this._subscribedTblId = null;
    setTableChatMessages([]);

    if (!tableId || !isFirebaseConfigured()) return;

    const db = getDB();
    const tcRef = query(
      ref(db, `tableChat/${this._scene}/${tableId}`),
      limitToLast(50),
    );
    this._tableChatUnsub = onValue(tcRef, snap => {
      const msgs = [];
      snap.forEach(child => msgs.push({ id: child.key, ...child.val() }));
      setTableChatMessages(msgs);
    });
    this._subscribedTblId = tableId;
  }

  /**
   * 전체 채팅 메시지 전송 — Firebase /chat/{scene}/
   * @param {string} text
   */
  sendChat(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    const { auth } = store.getState();
    const user = auth.user;
    if (!user) return;

    if (!isFirebaseConfigured()) {
      addChatMessage({
        id:        nanoid(8),
        from:      user.id,
        fromName:  user.username,
        fromAvatar: user.avatar,
        text:      trimmed,
        timestamp: Date.now(),
      });
      return;
    }

    push(ref(getDB(), `chat/${this._scene}`), {
      from:      user.id,
      fromName:  user.username,
      fromAvatar: user.avatar ?? {},
      text:      trimmed,
      timestamp: serverTimestamp(),
    });
  }

  /**
   * 합석 채팅 전송 — Firebase /tableChat/{scene}/{tableId}/
   * @param {string} text
   */
  sendTableChat(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    const { auth, myTableId } = store.getState();
    const user = auth.user;
    if (!user || !myTableId) {
      showNotification('테이블에 앉아야 합석 채팅을 할 수 있어요.', 'info');
      return;
    }

    if (!isFirebaseConfigured()) return;

    push(ref(getDB(), `tableChat/${this._scene}/${myTableId}`), {
      from:      user.id,
      fromName:  user.username,
      fromAvatar: user.avatar ?? {},
      text:      trimmed,
      timestamp: serverTimestamp(),
    });
  }

  /**
   * 합석 수락 — 요청자를 내 테이블의 빈 좌석으로 안내
   * @param {string} fromId   - 요청자 userId
   * @param {string} reqKey   - Firebase joinRequests key (삭제용)
   */
  acceptJoin(fromId, reqKey) {
    const { auth, myTableId, mySeatIndex } = store.getState();
    if (!auth.user || !myTableId) {
      showNotification('먼저 테이블에 앉아주세요 😊', 'info');
      return;
    }

    // 내 테이블에서 비어있는 좌석 탐색
    const takenAtTable = new Set(
      presenceManager.getOthers()
        .filter(u => u.tableId === myTableId)
        .map(u => u.seatIndex),
    );
    takenAtTable.add(mySeatIndex);

    let emptySeat = -1;
    for (let s = 0; s < SEATS_PER_TABLE; s++) {
      if (!takenAtTable.has(s)) { emptySeat = s; break; }
    }

    if (emptySeat === -1) {
      showNotification('테이블이 꽉 찼어요 😅 자리가 없네요.', 'info');
      return;
    }

    if (!isFirebaseConfigured()) {
      resolveJoinRequest(fromId, true);
      showNotification('합석을 수락했어요!', 'success');
      return;
    }

    const db        = getDB();
    const safeFrom  = fromId.replace(/[.#$/[\]]/g, '_');
    const safeMyId  = auth.user.id.replace(/[.#$/[\]]/g, '_');

    // 요청자에게 결과 전달
    push(ref(db, `joinResults/${safeFrom}`), {
      accepted:  true,
      tableId:   myTableId,
      seatIndex: emptySeat,
      timestamp: serverTimestamp(),
    });

    // 처리된 요청 Firebase에서 삭제
    if (reqKey) remove(ref(db, `joinRequests/${safeMyId}/${reqKey}`));

    resolveJoinRequest(fromId, true);
    showNotification('합석을 수락했어요! 🎉', 'success');
  }

  /**
   * 합석 거절
   * @param {string} fromId
   * @param {string} reqKey
   */
  declineJoin(fromId, reqKey) {
    const { auth } = store.getState();
    if (!auth.user) return;

    if (isFirebaseConfigured()) {
      const db       = getDB();
      const safeFrom = fromId.replace(/[.#$/[\]]/g, '_');
      const safeMyId = auth.user.id.replace(/[.#$/[\]]/g, '_');

      push(ref(db, `joinResults/${safeFrom}`), {
        accepted:  false,
        timestamp: serverTimestamp(),
      });
      if (reqKey) remove(ref(db, `joinRequests/${safeMyId}/${reqKey}`));
    }

    resolveJoinRequest(fromId, false);
    showNotification('합석 요청을 거절했어요.', 'info');
  }

  /**
   * 합석 요청 전송 — 테이블에 앉아있는 모든 유저에게 요청 push
   * @param {string} tableId - 합석하고 싶은 테이블 ID
   */
  requestJoin(tableId) {
    const { auth, onlineUsers } = store.getState();
    const me = auth.user;
    if (!me) return;

    if (!isFirebaseConfigured()) {
      showNotification('합석 기능은 Firebase 설정 후 이용할 수 있어요.', 'info');
      return;
    }

    // 해당 테이블에 앉아있는 다른 유저 전원에게 요청 전송
    const targets = onlineUsers.filter(u => u.tableId === tableId && u.id !== me.id);
    if (!targets.length) {
      showNotification('테이블에 아무도 없어요 🤔', 'info');
      return;
    }

    const db = getDB();
    targets.forEach(target => {
      const safeId = target.id.replace(/[.#$/[\]]/g, '_');
      push(ref(db, `joinRequests/${safeId}`), {
        fromId:     me.id,
        fromName:   me.username,
        fromAvatar: me.avatar ?? {},
        tableId:    tableId,
        timestamp:  serverTimestamp(),
      });
    });
    showNotification('합석 요청을 보냈어요! 🙏', 'info');
  }

  /** bots 호환 getter (봇 없음) */
  get bots() { return []; }

  // ── 내부 ─────────────────────────────────────────────────

  /**
   * 접속 시 자동 착석 — Firebase 초기 데이터 도착 후 빈 자리 배정
   * 이미 착석 중이거나 테이블이 없으면 스킵
   */
  _autoSit() {
    const { myTableId } = store.getState();
    if (myTableId != null) return; // 이미 착석

    // 현재 다른 유저들이 점유한 좌석 수집
    const takenSeats = new Set(
      presenceManager.getOthers()
        .filter(u => u.tableId != null)
        .map(u => `${u.tableId}_${u.seatIndex}`),
    );

    // 빈 좌석 목록 생성
    const available = [];
    for (let t = 0; t < this._tableCount; t++) {
      for (let s = 0; s < SEATS_PER_TABLE; s++) {
        if (!takenSeats.has(`table_${t}_${s}`)) {
          available.push({ tableId: `table_${t}`, seatIndex: s });
        }
      }
    }

    if (!available.length) return;

    // 랜덤 빈 좌석 선택
    const chosen = available[Math.floor(Math.random() * available.length)];
    setSeat(chosen.tableId, chosen.seatIndex);
    this.refreshMyPosition();
  }

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

    // 룸 카운터 셀프 힐링 — 실제 presence 인원으로 드리프트 보정
    roomAllocator.reconcile(presenceManager.getTotalCount());
  }
}

export const multiplayerSim = new MultiplayerSim();
