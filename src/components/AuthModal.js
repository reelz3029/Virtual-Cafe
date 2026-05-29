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
  transform-origin: 57px 78px;
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
          <path d="M57 78 Q76 64 68 48" stroke="#D4C4A8" stroke-width="9" stroke-linecap="round" fill="none"/>
          <path d="M57 78 Q76 64 68 48" stroke="#F5EDD8" stroke-width="5.2" stroke-linecap="round" fill="none"/>
        </g>
        <!-- 왼쪽 귀 -->
        <ellipse cx="22" cy="20" rx="11.5" ry="15" fill="#D4C4A8" transform="rotate(-14 22 20)"/>
        <ellipse cx="22" cy="20" rx="9"    ry="12" fill="#F5EDD8"  transform="rotate(-14 22 20)"/>
        <ellipse cx="22" cy="22" rx="5"    ry="7"  fill="#FFD4CC"  transform="rotate(-14 22 20)"/>
        <!-- 오른쪽 귀 -->
        <ellipse cx="62" cy="20" rx="11.5" ry="15" fill="#D4C4A8" transform="rotate(14 62 20)"/>
        <ellipse cx="62" cy="20" rx="9"    ry="12" fill="#F5EDD8"  transform="rotate(14 62 20)"/>
        <ellipse cx="62" cy="22" rx="5"    ry="7"  fill="#FFD4CC"  transform="rotate(14 62 20)"/>
        <!-- 머리 -->
        <circle cx="42" cy="42" r="27" fill="#D4C4A8"/>
        <circle cx="42" cy="41" r="25" fill="#F5EDD8"/>
        <!-- 몸통 -->
        <ellipse cx="42" cy="78" rx="22" ry="20" fill="#D4C4A8"/>
        <ellipse cx="42" cy="77" rx="20" ry="18" fill="#F5EDD8"/>
        <!-- 앞발 -->
        <ellipse cx="26" cy="89" rx="11" ry="7"   fill="#D4C4A8"/>
        <ellipse cx="26" cy="88" rx="9.2" rx="9.2" ry="5.8" fill="#F5EDD8"/>
        <ellipse cx="58" cy="89" rx="11" ry="7"   fill="#D4C4A8"/>
        <ellipse cx="58" cy="88" rx="9.2" ry="5.8" fill="#F5EDD8"/>
        <!-- 눈 (큰 동그란 치비 눈) -->
        <circle cx="33" cy="41" r="7" fill="#1A1010"/>
        <circle cx="35" cy="38" r="2.2" fill="white"/>
        <circle cx="51" cy="41" r="7" fill="#1A1010"/>
        <circle cx="53" cy="38" r="2.2" fill="white"/>
        <!-- 코 -->
        <path d="M38 51 L42 55 L46 51 Z" fill="#E08090"/>
        <!-- 입 -->
        <path d="M37 55 Q42 60 47 55" stroke="rgba(90,50,20,0.62)" stroke-width="1.9" fill="none" stroke-linecap="round"/>
        <!-- 볼터치 -->
        <ellipse cx="24" cy="49" rx="8" ry="4.5" fill="rgba(240,140,125,0.26)"/>
        <ellipse cx="60" cy="49" rx="8" ry="4.5" fill="rgba(240,140,125,0.26)"/>
        <!-- 수염 -->
        <line x1="3"  y1="49" x2="27" y2="51" stroke="rgba(100,70,40,0.40)" stroke-width="1.4" stroke-linecap="round"/>
        <line x1="3"  y1="55" x2="27" y2="55" stroke="rgba(100,70,40,0.40)" stroke-width="1.4" stroke-linecap="round"/>
        <line x1="81" y1="49" x2="57" y2="51" stroke="rgba(100,70,40,0.40)" stroke-width="1.4" stroke-linecap="round"/>
        <line x1="81" y1="55" x2="57" y2="55" stroke="rgba(100,70,40,0.40)" stroke-width="1.4" stroke-linecap="round"/>
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
