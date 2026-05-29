/**
 * components/AuthModal.js
 * 로그인 모달 — Google 계정 / 게스트(닉네임 입력)
 */

import { store } from '../store/gameStore.js';
import {
  GOOGLE_CLIENT_ID,
  handleGoogleCredential,
  loginAsGuest,
} from '../systems/authService.js';

export class AuthModal {
  constructor(container) {
    this.container = container;
    this._el = null;
    this._unsubscribe = null;
    this._googleTimer = null;
    this._guestOpen = false;

    this._render();
    this._unsubscribe = store.subscribe(() => this._syncState());
    this._initGoogleButton();
  }

  // ── 렌더 ────────────────────────────────────────────────────
  _render() {
    this._el = document.createElement('div');
    this._el.className = 'auth-overlay';
    this._el.innerHTML = this._getHTML();
    this.container.appendChild(this._el);
    this._bindEvents();
  }

  _getHTML() {
    return `
<style>
@keyframes auth-fadeIn  { from { opacity:0 } to { opacity:1 } }
@keyframes auth-scaleIn { from { opacity:0; transform:scale(.93) translateY(10px) } to { opacity:1; transform:scale(1) translateY(0) } }
@keyframes auth-float   { 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-7px) } }
@keyframes auth-shimmer { from{ transform:translateX(-100%) } to{ transform:translateX(100%) } }
@keyframes auth-tail    { 0%,100%{ transform:rotate(-10deg) } 50%{ transform:rotate(10deg) } }

.auth-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at 40% 60%, rgba(240,200,140,.55) 0%, rgba(255,248,242,.94) 100%);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
  animation: auth-fadeIn .3s ease both;
}

/* 배경 장식 패턴 */
.auth-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle, rgba(180,120,60,.06) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
}

.auth-card {
  background: #fff;
  border: 1.5px solid rgba(200,160,90,.22);
  border-radius: 24px;
  box-shadow: 0 8px 40px rgba(58,36,12,.12), 0 2px 8px rgba(58,36,12,.06);
  width: 100%;
  max-width: 400px;
  padding: 0 0 28px;
  animation: auth-scaleIn .4s cubic-bezier(.34,1.56,.64,1) both;
  overflow: hidden;
  position: relative;
}

/* 상단 따뜻한 헤더 영역 */
.auth-header-bg {
  background: linear-gradient(160deg, #FFF0DC 0%, #F5D8A8 100%);
  padding: 28px 24px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-bottom: 1px solid rgba(200,150,80,.15);
  position: relative;
  overflow: hidden;
}

/* 헤더 배경 커피잔 장식 */
.auth-header-bg::after {
  content: '☕';
  position: absolute;
  right: 18px;
  bottom: 8px;
  font-size: 52px;
  opacity: .09;
  pointer-events: none;
}

/* 고양이 SVG 아이콘 */
.auth-cat-wrap {
  animation: auth-float 3.2s ease-in-out infinite;
  margin-bottom: 12px;
  filter: drop-shadow(0 4px 12px rgba(140,80,20,.18));
}
.auth-cat-tail-anim {
  transform-origin: 48px 72px;
  animation: auth-tail 2s ease-in-out infinite;
}

.auth-logo h1 {
  font-family: 'Gowun Batang', serif;
  font-size: 28px;
  font-weight: 700;
  color: #5A3818;
  letter-spacing: .01em;
  margin: 0 0 4px;
  text-align: center;
}
.auth-logo p {
  font-size: 12.5px;
  color: #A07838;
  margin: 0;
  text-align: center;
  letter-spacing: .02em;
}

/* 카드 본문 */
.auth-body {
  padding: 22px 28px 0;
}

/* 에러 */
.auth-error {
  padding: 9px 12px;
  background: rgba(208,88,74,.07);
  border: 1px solid rgba(208,88,74,.22);
  border-radius: 10px;
  font-size: 12.5px;
  color: #B03030;
  margin-bottom: 14px;
  display: none;
}
.auth-error.visible { display: block; }

/* Google 버튼 래퍼 */
.google-btn-wrapper {
  display: flex;
  justify-content: center;
  min-height: 44px;
  margin-bottom: 4px;
}

.btn-google-fallback {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 11px 16px;
  background: #fff;
  border: 1.5px solid #e0d4c4;
  border-radius: 12px;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #3c4043;
  cursor: pointer;
  transition: background .15s, box-shadow .15s, border-color .15s;
}
.btn-google-fallback:hover {
  background: #fdf8f0;
  border-color: #c8a870;
  box-shadow: 0 2px 8px rgba(160,100,40,.12);
}
.btn-google-fallback:active { background:#f5eedd; }
.btn-google-fallback.loading {
  opacity: .7;
  pointer-events: none;
  position: relative;
  overflow: hidden;
}
.btn-google-fallback.loading::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.4) 50%, transparent 100%);
  animation: auth-shimmer 1.2s infinite;
}
.google-icon { width: 18px; height: 18px; flex-shrink: 0; }

/* 구분선 */
.auth-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0;
  color: #C8A068;
  font-size: 12px;
}
.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(200,160,100,.28);
}

/* 게스트 버튼 */
.btn-guest {
  width: 100%;
  padding: 11px;
  background: #FFF5E8;
  color: #7A5228;
  border: 1.5px solid rgba(200,150,80,.32);
  border-radius: 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all .15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
.btn-guest:hover {
  background: #F5E8D0;
  border-color: rgba(200,150,80,.6);
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(160,90,30,.12);
}

/* 게스트 닉네임 폼 */
.guest-nickname-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.input-group { display:flex; flex-direction:column; gap:5px; }
.input-group label { font-size:12px; font-weight:600; color:#7A5228; letter-spacing:.02em; }
.input-group input {
  padding: 10px 13px;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  color: #3A2410;
  background: #FFF8F0;
  border: 1.5px solid rgba(200,150,80,.28);
  border-radius: 11px;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.input-group input::placeholder { color:#C8A068; }
.input-group input:focus {
  border-color: #A87838;
  box-shadow: 0 0 0 3px rgba(200,150,80,.13);
  background: #fff;
}
.guest-form-actions { display: flex; gap: 8px; }
.btn-guest-cancel {
  flex: 0 0 auto;
  padding: 10px 14px;
  background: #FFF0E0;
  color: #7A5228;
  border: 1.5px solid rgba(200,150,80,.3);
  border-radius: 11px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background .15s;
}
.btn-guest-cancel:hover { background:#F5E0C8; }
.btn-guest-confirm {
  flex: 1;
  padding: 11px;
  background: linear-gradient(160deg, #8B5428 0%, #6A3C1A 100%);
  color: #FFF0E0;
  border: none;
  border-radius: 11px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all .15s;
  position: relative;
  overflow: hidden;
  letter-spacing: .02em;
}
.btn-guest-confirm:hover {
  background: linear-gradient(160deg, #9A6030 0%, #7A4620 100%);
  transform: translateY(-1px);
  box-shadow: 0 5px 16px rgba(90,52,18,.28);
}
.btn-guest-confirm:active { transform:translateY(0); }
.btn-guest-confirm.loading { opacity:.7; pointer-events:none; }
.btn-guest-confirm.loading::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent);
  animation: auth-shimmer 1.2s infinite;
}

/* Google 미설정 안내 */
.google-not-configured {
  width: 100%;
  padding: 10px 14px;
  background: rgba(90,140,212,.07);
  border: 1px solid rgba(90,140,212,.22);
  border-radius: 10px;
  font-size: 12px;
  color: #3050A0;
  text-align: center;
  line-height: 1.55;
}
</style>

<div class="auth-card">
  <!-- 따뜻한 헤더 -->
  <div class="auth-header-bg">
    <!-- 고양이 일러스트 -->
    <div class="auth-cat-wrap">
      <svg width="88" height="96" viewBox="0 0 88 96" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- 꼬리 -->
        <g class="auth-cat-tail-anim">
          <path d="M58 76 Q78 66 72 50" stroke="#E8A060" stroke-width="7.5" stroke-linecap="round" fill="none"/>
          <path d="M58 76 Q78 66 72 50" stroke="#5A3418" stroke-width="2" stroke-linecap="round" fill="none"/>
        </g>
        <!-- 왼쪽 귀 -->
        <path d="M18 34 L6 10 L26 28" fill="#F0C080" stroke="#5A3418" stroke-width="2" stroke-linejoin="round"/>
        <path d="M19 32 L11 15 L24 26" fill="#EFA090" stroke="none"/>
        <!-- 오른쪽 귀 -->
        <path d="M62 34 L74 10 L54 28" fill="#F0C080" stroke="#5A3418" stroke-width="2" stroke-linejoin="round"/>
        <path d="M61 32 L69 15 L56 26" fill="#EFA090" stroke="none"/>
        <!-- 머리 -->
        <ellipse cx="40" cy="46" rx="26" ry="24" fill="#F5C880" stroke="#5A3418" stroke-width="2"/>
        <!-- 머리 무늬 -->
        <path d="M30 30 Q40 27 50 30" stroke="#D49848" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.55"/>
        <!-- 눈 -->
        <path d="M27 44 Q31 40 35 44" stroke="#3A2010" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M45 44 Q49 40 53 44" stroke="#3A2010" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <!-- 코 -->
        <path d="M37 52 L40 55.5 L43 52 Z" fill="#E87888"/>
        <!-- 입 -->
        <path d="M37 55.5 Q40 59 43 55.5" stroke="#5A3418" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <!-- 볼터치 -->
        <ellipse cx="27" cy="54" rx="7" ry="4.5" fill="rgba(228,130,110,.30)"/>
        <ellipse cx="53" cy="54" rx="7" ry="4.5" fill="rgba(228,130,110,.30)"/>
        <!-- 수염 -->
        <line x1="4" y1="50" x2="22" y2="52" stroke="#5A3418" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="4" y1="55" x2="22" y2="55" stroke="#5A3418" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="76" y1="50" x2="58" y2="52" stroke="#5A3418" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="76" y1="55" x2="58" y2="55" stroke="#5A3418" stroke-width="1.5" stroke-linecap="round"/>
        <!-- 몸통 -->
        <ellipse cx="40" cy="80" rx="22" ry="19" fill="#F5C880" stroke="#5A3418" stroke-width="2"/>
        <!-- 앞발 -->
        <ellipse cx="25" cy="91" rx="10" ry="6" fill="#F0B870" stroke="#5A3418" stroke-width="1.8"/>
        <ellipse cx="52" cy="91" rx="10" ry="6" fill="#F0B870" stroke="#5A3418" stroke-width="1.8"/>
        <!-- 발가락 선 -->
        <path d="M20 91 Q25 95 30 91" stroke="#5A3418" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <path d="M47 91 Q52 95 57 91" stroke="#5A3418" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      </svg>
    </div>

    <!-- 로고 텍스트 -->
    <div class="auth-logo">
      <h1>Somewhere</h1>
      <p>따뜻한 고양이 카페에서 함께해요 ☕</p>
    </div>
  </div>

  <!-- 본문 -->
  <div class="auth-body">
    <div class="auth-error" id="auth-error"></div>

    <div class="google-btn-wrapper">
      <div id="google-btn-container" style="width:100%">
        <div style="height:44px;background:#f5eedd;border-radius:12px;overflow:hidden;position:relative;">
          <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);animation:auth-shimmer 1.5s infinite;"></div>
        </div>
      </div>
    </div>

    <div class="auth-divider">또는</div>

    <div id="guest-section">
      <button class="btn-guest" id="btn-guest-toggle">
        <span>🐾</span>
        <span>닉네임으로 게스트 입장</span>
      </button>
    </div>

    <div class="guest-nickname-form" id="guest-nickname-form" style="display:none">
      <div class="input-group">
        <label>닉네임</label>
        <input type="text" id="guest-nickname" placeholder="2~12자로 입력해주세요" maxlength="12" autocomplete="off" />
      </div>
      <div class="guest-form-actions">
        <button class="btn-guest-cancel" id="btn-guest-cancel">취소</button>
        <button class="btn-guest-confirm" id="btn-guest-confirm">입장하기 →</button>
      </div>
    </div>
  </div>
</div>
`;
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────────
  _bindEvents() {
    // 게스트 폼 토글
    this._el.querySelector('#btn-guest-toggle')?.addEventListener('click', () => {
      this._openGuestForm();
    });

    // 취소
    this._el.querySelector('#btn-guest-cancel')?.addEventListener('click', () => {
      this._closeGuestForm();
    });

    // 게스트 입장 확인
    this._el.querySelector('#btn-guest-confirm')?.addEventListener('click', () => {
      this._handleGuestConfirm();
    });

    // Enter 키
    this._el.querySelector('#guest-nickname')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._handleGuestConfirm();
      if (e.key === 'Escape') this._closeGuestForm();
    });
  }

  // ── Google 버튼 초기화 ───────────────────────────────────────
  _initGoogleButton() {
    const container = this._el.querySelector('#google-btn-container');
    if (!container) return;

    const tryRender = () => {
      if (window.google?.accounts?.id) {
        this._renderGoogleButton(container);
      } else {
        this._googleTimer = setTimeout(tryRender, 150);
      }
    };
    tryRender();
  }

  _renderGoogleButton(container) {
    // CLIENT_ID 미설정 시 안내 메시지
    if (GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE')) {
      container.innerHTML = `
        <div class="google-not-configured">
          🔧 Google 로그인을 사용하려면<br>
          <code>authService.js</code>의 <code>GOOGLE_CLIENT_ID</code>를 설정하세요.
        </div>`;
      return;
    }

    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback:  async response => {
          this._showError('');
          const result = await handleGoogleCredential(response.credential);
          if (!result.ok) this._showError(result.error);
        },
        auto_select: false,
        cancel_on_tap_outside: false,
      });

      google.accounts.id.renderButton(container, {
        type:   'standard',
        theme:  'outline',
        size:   'large',
        text:   'continue_with',
        locale: 'ko',
        width:  Math.min(328, window.innerWidth - 80),
      });
    } catch {
      // CLIENT_ID 오류 등 — 커스텀 버튼 대체
      container.innerHTML = `
        <button class="btn-google-fallback" id="btn-google-fallback">
          <svg class="google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google 계정으로 계속하기
        </button>`;

      this._el.querySelector('#btn-google-fallback')?.addEventListener('click', async () => {
        const btn = this._el.querySelector('#btn-google-fallback');
        btn?.classList.add('loading');
        this._showError('Google OAuth Client ID를 설정해주세요.');
        btn?.classList.remove('loading');
      });
    }
  }

  // ── 게스트 폼 ────────────────────────────────────────────────
  _openGuestForm() {
    this._guestOpen = true;
    this._el.querySelector('#guest-section').style.display = 'none';
    this._el.querySelector('#guest-nickname-form').style.display = 'flex';
    setTimeout(() => this._el.querySelector('#guest-nickname')?.focus(), 50);
  }

  _closeGuestForm() {
    this._guestOpen = false;
    this._showError('');
    this._el.querySelector('#guest-nickname-form').style.display = 'none';
    this._el.querySelector('#guest-section').style.display = '';
    const input = this._el.querySelector('#guest-nickname');
    if (input) input.value = '';
  }

  async _handleGuestConfirm() {
    const input = this._el.querySelector('#guest-nickname');
    const confirmBtn = this._el.querySelector('#btn-guest-confirm');
    const nickname = input?.value ?? '';

    this._showError('');
    confirmBtn?.classList.add('loading');

    const result = await loginAsGuest(nickname);

    confirmBtn?.classList.remove('loading');
    if (!result.ok) {
      this._showError(result.error);
      input?.focus();
    }
  }

  // ── 유틸 ─────────────────────────────────────────────────────
  _showError(msg) {
    const el = this._el.querySelector('#auth-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('visible', !!msg);
  }

  _syncState() {
    const { auth, ui } = store.getState();
    if (auth.isLoggedIn || !ui.showAuth) this._close();
  }

  _close() {
    if (this._googleTimer) clearTimeout(this._googleTimer);
    this._el.style.animation = 'auth-fadeIn .2s ease reverse both';
    setTimeout(() => this._el?.remove(), 200);
  }

  destroy() {
    if (this._googleTimer) clearTimeout(this._googleTimer);
    this._unsubscribe?.();
    this._el?.remove();
  }
}
