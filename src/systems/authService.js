/**
 * systems/authService.js
 * 인증 서비스 — Google 계정 로그인 / 게스트(닉네임) 입장
 *
 * [설정 필요]
 * GOOGLE_CLIENT_ID 를 Google Cloud Console에서 발급받은 OAuth 2.0 클라이언트 ID로 교체하세요.
 * https://console.cloud.google.com/ → API 및 서비스 → 사용자 인증 정보
 */

import { nanoid } from 'nanoid';
import {
  store,
  loginUser,
  logoutUser,
  setAuthLoading,
  saveUserToLocal,
  loadUserFromLocal,
  clearLocalUser,
  showNotification,
} from '../store/gameStore.js';

// ── Google OAuth 클라이언트 ID ─────────────────────────────────
// TODO: 아래 값을 실제 Client ID로 교체하세요
export const GOOGLE_CLIENT_ID = '728457911469-im0rtn1tt9al016232255kv19i8f0l40.apps.googleusercontent.com';

// ── 기본 캐릭터 설정 ──────────────────────────────────────────
export const DEFAULT_CHARACTER = {
  bodyColor: '#F4C896',
  accessories: [],
};

// ── Google 유저 영구 데이터 저장소 (coin, avatar, totalTime) ──
function getGoogleUsers() {
  try {
    return JSON.parse(localStorage.getItem('somewhere_google_users') || '{}');
  } catch {
    return {};
  }
}

function saveGoogleUsers(users) {
  try {
    localStorage.setItem('somewhere_google_users', JSON.stringify(users));
  } catch {}
}

// ── Google JWT 디코드 (서명 검증 없음 — 클라이언트 사이드 데모용) ──
function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

// ── Google 크레덴셜 처리 ──────────────────────────────────────
export async function handleGoogleCredential(credential) {
  setAuthLoading(true);

  const payload = decodeJwt(credential);
  if (!payload) {
    setAuthLoading(false, 'Google 인증에 실패했습니다.');
    return { ok: false, error: 'Google 인증에 실패했습니다.' };
  }

  const { sub, name, email } = payload;
  const googleKey = sub;
  const googleUsers = getGoogleUsers();

  let userData = googleUsers[googleKey];
  const isNew = !userData;

  if (isNew) {
    userData = {
      id:        `google_${sub}`,
      username:  name,
      email,
      avatar:    DEFAULT_CHARACTER,
      joinedAt:  new Date().toISOString(),
      totalTime: 0,
      isGoogle:  true,
    };
    googleUsers[googleKey] = userData;
    saveGoogleUsers(googleUsers);
  }

  const sessionUser = { ...userData };
  saveUserToLocal(sessionUser);
  loginUser(sessionUser);

  showNotification(
    isNew ? `🎉 첫 입장을 환영해요, ${userData.username}님!` : `어서오세요, ${userData.username}님! ☕`,
    'success',
  );

  return { ok: true, user: sessionUser };
}

// ── 게스트 로그인 (닉네임 입력 필수) ─────────────────────────
export async function loginAsGuest(nickname) {
  const trimmed = (nickname || '').trim();
  if (trimmed.length < 2 || trimmed.length > 12) {
    return { ok: false, error: '닉네임은 2~12자여야 합니다.' };
  }

  setAuthLoading(true);
  await delay(200);

  const guestUser = {
    id:        `guest_${nanoid(8)}`,
    username:  trimmed,
    email:     null,
    avatar:    DEFAULT_CHARACTER,
    joinedAt:  new Date().toISOString(),
    totalTime: 0,
    isGuest:   true,
  };

  loginUser(guestUser);
  showNotification(`반갑습니다, ${guestUser.username}님! 게스트로 입장합니다.`, 'info');
  return { ok: true, user: guestUser };
}

// ── 자동 로그인 (페이지 새로고침) ─────────────────────────────
export function tryAutoLogin() {
  const saved = loadUserFromLocal();
  if (!saved || saved.isGuest) return false;

  // Google 유저면 저장된 최신 데이터(avatar, totalTime)로 업데이트
  if (saved.isGoogle) {
    const key = saved.id.replace('google_', '');
    const googleUsers = getGoogleUsers();
    if (googleUsers[key]) Object.assign(saved, googleUsers[key]);
  }

  loginUser(saved);
  showNotification(`어서오세요, ${saved.username}님! ☕`, 'success');
  return true;
}

// ── 로그아웃 ──────────────────────────────────────────────────
export function logout() {
  const { auth } = store.getState();
  if (auth.user && !auth.user.isGuest) {
    _updateTotalTime(auth.user);
  }
  clearLocalUser();
  logoutUser();
  showNotification('로그아웃되었습니다.', 'info');
}

// ── 내부 유틸 ─────────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function _updateTotalTime(user) {
  if (!user.isGoogle) return;
  const { sessionStart } = store.getState();
  if (!sessionStart) return;
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const key = user.id.replace('google_', '');
  const users = getGoogleUsers();
  if (users[key]) {
    users[key].totalTime = (users[key].totalTime || 0) + elapsed;
    saveGoogleUsers(users);
  }
}
