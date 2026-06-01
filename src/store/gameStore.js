/**
 * store/gameStore.js
 * 전역 상태 관리 — Zustand 기반
 * 인증, 사용자, 월드 상태를 단일 스토어에서 관리
 */

// 간단한 Zustand-like 구현 (번들 크기 최소화)
class Store {
  constructor(initialState) {
    this._state = { ...initialState };
    this._listeners = new Set();
  }

  getState() {
    return this._state;
  }

  setState(updater) {
    const prev = this._state;
    const next = typeof updater === 'function'
      ? { ...this._state, ...updater(this._state) }
      : { ...this._state, ...updater };
    this._state = next;
    this._listeners.forEach(fn => fn(next, prev));
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}

// ── 초기 상태 ──────────────────────────────────────────────
const INITIAL_STATE = {
  // ── 인증 상태 ──
  auth: {
    isLoggedIn: false,
    user: null,         // { id, username, email, avatar, accessory, coin, joinedAt }
    loading: false,
    error: null,
  },

  // ── 현재 씬 ──
  scene: 'cafe',        // 'cafe' | 'airport' | 'park'

  // ── 접속 중인 사용자 목록 ──
  onlineUsers: [],      // [{ id, username, avatar, accessory, tableId, seatIndex }]

  // ── 내 위치 ──
  myTableId: null,
  mySeatIndex: null,

  // ── 합석 시스템 ──
  joinRequests: [],     // [{ fromId, fromName, fromAvatar, tableId }]

  // ── 채팅 ──
  chatMessages: [],      // [{ id, from, fromName, text, timestamp }] — 전체
  tableChatMessages: [], // [{ id, from, fromName, text, timestamp }] — 합석 전용
  isChatOpen: false,

  // ── 커피 메뉴 ──
  coffeeMenu: [
    { id: 'espresso',   name: '에스프레소',  price: 15,  emoji: '☕', desc: '진하고 강렬한' },
    { id: 'latte',      name: '카페 라떼',   price: 25,  emoji: '🥛', desc: '부드럽고 크리미한' },
    { id: 'matcha',     name: '말차 라떼',   price: 30,  emoji: '🍵', desc: '향긋하고 건강한' },
    { id: 'americano',  name: '아메리카노',  price: 20,  emoji: '🫖', desc: '깔끔하고 산뜻한' },
    { id: 'smoothie',   name: '스무디',      price: 35,  emoji: '🧃', desc: '달콤하고 시원한' },
    { id: 'tiramisu',   name: '티라미수',    price: 45,  emoji: '🍰', desc: '달콤한 디저트' },
  ],
  heldCoffee: null,     // 현재 들고 있는 음료 { id, name, emoji }
  coffeeEffect: null,   // 커피 효과 타이머

  // ── UI 상태 ──
  ui: {
    showAuth: true,
    showCharacterSelect: false,
    showCoffeeMenu: false,
    showJoinRequest: false,
    showSceneSelect: false,
    showSettings: false,
    activePanel: null,
  },

  // ── 월드 카메라 ──
  camera: {
    x: 0,
    y: 0,
    zoom: 1.0,
  },

  // ── 뷰 모드: 'iso'(로비 탑다운) | 'fp'(착석 1인칭) ──
  viewMode: 'iso',

  // ── 룸 샤딩: 현재 배정된 룸 인스턴스 ──
  room: { id: null, label: null },

  // ── 시스템 ──
  sessionStart: null,
  coinAccumulator: 0,
  notification: null,
};

// ── 스토어 생성 ────────────────────────────────────────────
export const store = new Store(INITIAL_STATE);

// ── 편의 액션 함수들 ───────────────────────────────────────

/** 로그인 */
export function loginUser(user) {
  store.setState(s => ({
    auth: { ...s.auth, isLoggedIn: true, user, loading: false, error: null },
    ui: { ...s.ui, showAuth: false, showCharacterSelect: false },
    sessionStart: Date.now(),
  }));
}

/** 로그아웃 */
export function logoutUser() {
  store.setState(s => ({
    auth: { isLoggedIn: false, user: null, loading: false, error: null },
    ui: { ...s.ui, showAuth: true },
    sessionStart: null,
    myTableId: null,
    mySeatIndex: null,
    chatMessages: [],
    tableChatMessages: [],
    isChatOpen: false,
  }));
}

/** 인증 로딩 */
export function setAuthLoading(loading, error = null) {
  store.setState(s => ({
    auth: { ...s.auth, loading, error },
  }));
}

/** 사용자 프로필 업데이트 (캐릭터 선택 포함) */
export function updateUserProfile(updates) {
  store.setState(s => ({
    auth: {
      ...s.auth,
      user: s.auth.user ? { ...s.auth.user, ...updates } : null,
    },
  }));
}

/** 코인 추가 */
export function addCoins(amount) {
  store.setState(s => {
    const user = s.auth.user;
    if (!user) return {};
    return {
      auth: {
        ...s.auth,
        user: { ...user, coin: (user.coin || 0) + amount },
      },
    };
  });
}

/** 코인 소비 */
export function spendCoins(amount) {
  const { auth } = store.getState();
  if (!auth.user || auth.user.coin < amount) return false;
  store.setState(s => ({
    auth: {
      ...s.auth,
      user: { ...s.auth.user, coin: s.auth.user.coin - amount },
    },
  }));
  return true;
}

/** 씬 변경 */
export function setScene(scene) {
  store.setState({ scene, onlineUsers: [], myTableId: null, mySeatIndex: null });
}

/** 온라인 사용자 업데이트 */
export function setOnlineUsers(users) {
  store.setState({ onlineUsers: users });
}

/** 사용자 착석 */
export function setSeat(tableId, seatIndex) {
  store.setState({ myTableId: tableId, mySeatIndex: seatIndex });
}

/** 뷰 모드 설정 ('iso' | 'fp') */
export function setViewMode(mode) {
  store.setState({ viewMode: mode });
}

/** 배정된 룸 인스턴스 설정 */
export function setRoom(id, label) {
  store.setState({ room: { id, label } });
}

/** 채팅 메시지 추가 (단일) */
export function addChatMessage(message) {
  store.setState(s => {
    // 중복 ID 방지 (Firebase onChildAdded 재구독 시)
    if (s.chatMessages.some(m => m.id === message.id)) return {};
    return { chatMessages: [...s.chatMessages.slice(-99), message] };
  });
}

/** 채팅 메시지 전체 교체 (Firebase onValue 동기화용) */
export function setChatMessages(messages) {
  store.setState({ chatMessages: messages });
}

/** 채팅 토글 */
export function toggleChat(open) {
  store.setState(s => ({
    isChatOpen: open !== undefined ? open : !s.isChatOpen,
  }));
}

/** 합석 요청 추가 */
export function addJoinRequest(request) {
  store.setState(s => ({
    joinRequests: [...s.joinRequests, request],
    ui: { ...s.ui, showJoinRequest: true },
  }));
}

/** 합석 요청 처리 */
export function resolveJoinRequest(fromId, accepted) {
  store.setState(s => {
    const remaining = s.joinRequests.filter(r => r.fromId !== fromId);
    return {
      joinRequests: remaining,
      ui: { ...s.ui, showJoinRequest: remaining.length > 0 },
    };
  });
}

/** 합석 채팅 메시지 전체 교체 */
export function setTableChatMessages(messages) {
  store.setState({ tableChatMessages: messages });
}

/** 커피 주문 */
export function orderCoffee(coffeeId) {
  const { coffeeMenu } = store.getState();
  const coffee = coffeeMenu.find(c => c.id === coffeeId);
  if (!coffee) return false;
  if (!spendCoins(coffee.price)) return false;

  store.setState(s => ({
    heldCoffee: coffee,
    ui: { ...s.ui, showCoffeeMenu: false },
  }));

  // 30분 후 자동 소비
  setTimeout(() => {
    store.setState({ heldCoffee: null });
  }, 30 * 60 * 1000);

  return true;
}

/** UI 패널 토글 */
export function toggleUI(panel, value) {
  store.setState(s => ({
    ui: {
      ...s.ui,
      [panel]: value !== undefined ? value : !s.ui[panel],
    },
  }));
}

/** 알림 표시 */
export function showNotification(message, type = 'info', duration = 3000) {
  const id = Date.now();
  store.setState({ notification: { id, message, type } });
  setTimeout(() => {
    store.setState(s => {
      if (s.notification?.id === id) return { notification: null };
      return {};
    });
  }, duration);
}

/** 세션 코인 적립 (1분마다 호출) */
export function tickSessionCoins() {
  const { auth, scene } = store.getState();
  if (!auth.isLoggedIn) return;

  // 씬별 적립률: 카페 2코인/분, 공항 1.5코인/분, 공원 1코인/분
  const rates = { cafe: 2, airport: 1.5, park: 1 };
  const rate = rates[scene] || 1;

  addCoins(rate);
  // 저장
  saveUserToLocal(store.getState().auth.user);
}

// ── 로컬 스토리지 헬퍼 ────────────────────────────────────

/** 사용자 데이터 로컬 저장 */
export function saveUserToLocal(user) {
  if (!user) return;
  try {
    localStorage.setItem('somewhere_user', JSON.stringify(user));
  } catch {}
}

/** 로컬에서 사용자 불러오기 */
export function loadUserFromLocal() {
  try {
    const raw = localStorage.getItem('somewhere_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 로컬 사용자 삭제 */
export function clearLocalUser() {
  try {
    localStorage.removeItem('somewhere_user');
  } catch {}
}
