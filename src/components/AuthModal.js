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
/* ── 전역 애니메이션 (중복 방지를 위해 한 번만 정의) ── */
@keyframes auth-fadeIn  { from { opacity:0 } to { opacity:1 } }
@keyframes auth-scaleIn { from { opacity:0; transform:scale(.94) } to { opacity:1; transform:scale(1) } }
@keyframes auth-float   { 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-6px) } }
@keyframes auth-shimmer { from{ transform:translateX(-100%) } to{ transform:translateX(100%) } }

.auth-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, rgba(253,250,244,.92) 0%, rgba(237,224,196,.88) 100%);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
  animation: auth-fadeIn .3s ease both;
}

.auth-card {
  background: #fff;
  border: 1px solid rgba(196,160,106,.25);
  border-radius: 20px;
  box-shadow: 0 4px 24px rgba(58,40,16,.10), 0 1px 4px rgba(58,40,16,.06);
  width: 100%;
  max-width: 400px;
  padding: 40px 36px 32px;
  animation: auth-scaleIn .35s cubic-bezier(.34,1.56,.64,1) both;
}

/* 로고 */
.auth-logo { text-align:center; margin-bottom:28px; }
.auth-logo-icon {
  font-size: 40px;
  display: block;
  margin-bottom: 10px;
  animation: auth-float 3s ease-in-out infinite;
}
.auth-logo h1 {
  font-family: 'Gowun Batang', serif;
  font-size: 26px;
  font-weight: 700;
  color: #5A3E18;
  letter-spacing: -.02em;
  margin: 0 0 4px;
}
.auth-logo p { font-size:13px; color:#A07840; margin:0; }

/* 에러 */
.auth-error {
  padding: 9px 12px;
  background: rgba(212,96,90,.08);
  border: 1px solid rgba(212,96,90,.25);
  border-radius: 8px;
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

/* GIS 라이브러리 미로드 시 표시하는 커스텀 버튼 */
.btn-google-fallback {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 11px 16px;
  background: #fff;
  border: 1.5px solid #dadce0;
  border-radius: 11px;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #3c4043;
  cursor: pointer;
  transition: background .15s, box-shadow .15s;
}
.btn-google-fallback:hover {
  background: #f8f9fa;
  box-shadow: 0 1px 4px rgba(60,64,67,.15);
}
.btn-google-fallback:active { background:#f1f3f4; }
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
.google-icon {
  width: 18px; height: 18px;
  flex-shrink: 0;
}

/* 구분선 */
.auth-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
  color: #C4A06A;
  font-size: 12px;
}
.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(196,160,106,.3);
}

/* 게스트 버튼 */
.btn-guest {
  width: 100%;
  padding: 10px;
  background: #F7F0E0;
  color: #7A5A28;
  border: 1.5px solid rgba(196,160,106,.35);
  border-radius: 11px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background .15s, border-color .15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-guest:hover { background:#EDE3CC; border-color:rgba(196,160,106,.6); }

/* 게스트 닉네임 폼 */
.guest-nickname-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.input-group { display:flex; flex-direction:column; gap:5px; }
.input-group label { font-size:12px; font-weight:500; color:#7A5A28; }
.input-group input {
  padding: 10px 13px;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  color: #3C2810;
  background: #FDFAF4;
  border: 1.5px solid rgba(196,160,106,.3);
  border-radius: 10px;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.input-group input::placeholder { color:#C4A06A; }
.input-group input:focus {
  border-color: #A07840;
  box-shadow: 0 0 0 3px rgba(160,120,64,.12);
  background: #fff;
}
.guest-form-actions {
  display: flex;
  gap: 8px;
}
.btn-guest-cancel {
  flex: 0 0 auto;
  padding: 10px 14px;
  background: #F7F0E0;
  color: #7A5A28;
  border: 1.5px solid rgba(196,160,106,.35);
  border-radius: 10px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background .15s;
}
.btn-guest-cancel:hover { background:#EDE3CC; }
.btn-guest-confirm {
  flex: 1;
  padding: 10px;
  background: #7A5A28;
  color: #F7F0E0;
  border: none;
  border-radius: 10px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all .15s;
  position: relative;
  overflow: hidden;
}
.btn-guest-confirm:hover { background:#5A3E18; transform:translateY(-1px); box-shadow:0 4px 12px rgba(90,62,24,.25); }
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
  border: 1px solid rgba(90,140,212,.25);
  border-radius: 10px;
  font-size: 12px;
  color: #3050A0;
  text-align: center;
  line-height: 1.5;
}
</style>

<div class="auth-card">
  <div class="auth-logo">
    <span class="auth-logo-icon">☕</span>
    <h1>Somewhere</h1>
    <p>가상의 카페에서 함께 작업해요</p>
  </div>

  <div class="auth-error" id="auth-error"></div>

  <!-- Google 로그인 버튼 (GIS 라이브러리가 렌더링) -->
  <div class="google-btn-wrapper">
    <div id="google-btn-container" style="width:100%">
      <!-- GIS 로드 전 스켈레톤 -->
      <div style="height:44px;background:#f0ece4;border-radius:11px;animation:auth-shimmer 1.5s infinite;overflow:hidden;position:relative;">
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);animation:auth-shimmer 1.5s infinite;"></div>
      </div>
    </div>
  </div>

  <div class="auth-divider">또는</div>

  <!-- 게스트 섹션 -->
  <div id="guest-section">
    <button class="btn-guest" id="btn-guest-toggle">
      <span>👤</span>
      <span>닉네임으로 게스트 입장</span>
    </button>
  </div>

  <!-- 게스트 닉네임 폼 (기본 숨김) -->
  <div class="guest-nickname-form" id="guest-nickname-form" style="display:none">
    <div class="input-group">
      <label>닉네임</label>
      <input type="text" id="guest-nickname" placeholder="2~12자" maxlength="12" autocomplete="off" />
    </div>
    <div class="guest-form-actions">
      <button class="btn-guest-cancel" id="btn-guest-cancel">취소</button>
      <button class="btn-guest-confirm" id="btn-guest-confirm">입장하기 →</button>
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
