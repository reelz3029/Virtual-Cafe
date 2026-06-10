/**
 * store/gameStore.js
 * 경량 전역 스토어 — 인증·세션·알림만 관리
 * (월드 상태는 cafeWorld, 접속자는 presenceManager 가 직접 소유)
 */

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
  auth: {
    isLoggedIn: false,
    user: null,         // { id, username, email, avatar, isGuest|isGoogle, joinedAt }
    loading: false,
    error: null,
  },
  ui: { showAuth: true },   // AuthModal 표시 여부
  sessionStart: null,        // 접속 시각 (총 공부시간 누적용)
  notification: null,        // { id, message, type } — ToastManager 가 구독
};

export const store = new Store(INITIAL_STATE);

// ── 액션 ──────────────────────────────────────────────────

/** 로그인 */
export function loginUser(user) {
  store.setState(s => ({
    auth: { ...s.auth, isLoggedIn: true, user, loading: false, error: null },
    ui: { ...s.ui, showAuth: false },
    sessionStart: Date.now(),
  }));
}

/** 로그아웃 */
export function logoutUser() {
  store.setState(s => ({
    auth: { isLoggedIn: false, user: null, loading: false, error: null },
    ui: { ...s.ui, showAuth: true },
    sessionStart: null,
  }));
}

/** 인증 로딩/에러 */
export function setAuthLoading(loading, error = null) {
  store.setState(s => ({
    auth: { ...s.auth, loading, error },
  }));
}

/** 토스트 알림 표시 */
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
