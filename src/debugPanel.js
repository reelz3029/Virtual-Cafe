/**
 * debugPanel.js
 * 개발자용 디버그 패널 — 시각 강제(해 변화 확인) + 가짜 손님 추가/제거
 *
 * 토글: 우하단 🛠 버튼 또는 백틱(`) 키
 *
 * 콜백:
 *   getHour()           → 현재 적용 중인 시각(0~24)
 *   setTimeOverride(h)  → h(0~24) 강제 / null = 실시간
 *   addFake() / removeFake()
 *   getCounts()         → { real, fake }
 */

export class DebugPanel {
  constructor({ getHour, setTimeOverride, addFake, removeFake, getCounts }) {
    this._getHour = getHour;
    this._setTimeOverride = setTimeOverride;
    this._addFake = addFake;
    this._removeFake = removeFake;
    this._getCounts = getCounts;
    this._open = false;

    this._build();
    this._onKey = (e) => {
      if (e.key === '`' || e.key === '~') {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        this.toggle();
      }
    };
    window.addEventListener('keydown', this._onKey);

    this._tick = setInterval(() => this._refresh(), 400);
  }

  _build() {
    const style = document.createElement('style');
    style.textContent = `
      #dbg-fab {
        position: fixed; right: 16px; bottom: 16px; z-index: 300;
        width: 40px; height: 40px; border-radius: 50%; border: none;
        background: rgba(40,26,16,0.8); color: #FFE6C2; font-size: 18px;
        cursor: pointer; backdrop-filter: blur(8px);
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
      }
      #dbg-fab:hover { background: rgba(60,40,22,0.9); }
      #dbg-panel {
        position: fixed; right: 16px; bottom: 64px; z-index: 300;
        width: 248px; display: none; flex-direction: column; gap: 12px;
        padding: 14px 16px; border-radius: 14px;
        background: rgba(28,20,12,0.92); backdrop-filter: blur(14px);
        border: 1px solid rgba(255,210,150,0.18); color: #F0E0C8;
        font: 12.5px/1.5 'DM Sans', sans-serif;
        box-shadow: 0 10px 34px rgba(0,0,0,0.45);
      }
      #dbg-panel.open { display: flex; }
      #dbg-panel h4 { font-size: 12px; color: #E8C49A; letter-spacing: .04em; margin: 0; text-transform: uppercase; }
      #dbg-panel .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      #dbg-panel input[type=range] { width: 100%; accent-color: #E89B4C; }
      #dbg-panel .seg { display: flex; gap: 6px; }
      #dbg-panel button.act {
        flex: 1; padding: 6px 0; border: none; border-radius: 8px; cursor: pointer;
        background: rgba(232,155,76,0.22); color: #FFE6C2; font-family: inherit; font-size: 12px;
      }
      #dbg-panel button.act:hover { background: rgba(232,155,76,0.35); }
      #dbg-panel label.chk { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #D6B894; }
      #dbg-time-val { color: #FFE6C2; font-weight: 600; }
      #dbg-counts { color: #D6B894; }
    `;
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.id = 'dbg-fab'; fab.textContent = '🛠'; fab.title = '디버그 패널 (`)';
    fab.onclick = () => this.toggle();
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'dbg-panel';
    panel.innerHTML = `
      <div>
        <h4>시간</h4>
        <label class="chk"><input type="checkbox" id="dbg-realtime" checked /> 실시간 동기화</label>
        <div class="row"><span>시각</span><span id="dbg-time-val">--:--</span></div>
        <input type="range" id="dbg-time" min="0" max="24" step="0.1" value="12" disabled />
      </div>
      <div>
        <h4>가짜 손님</h4>
        <div class="row"><span id="dbg-counts">접속 0 · 가짜 0</span></div>
        <div class="seg">
          <button class="act" id="dbg-fake-add">+ 추가</button>
          <button class="act" id="dbg-fake-del">− 제거</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;

    this._realtime = panel.querySelector('#dbg-realtime');
    this._slider = panel.querySelector('#dbg-time');
    this._timeVal = panel.querySelector('#dbg-time-val');
    this._counts = panel.querySelector('#dbg-counts');

    this._realtime.onchange = () => {
      const live = this._realtime.checked;
      this._slider.disabled = live;
      this._setTimeOverride(live ? null : parseFloat(this._slider.value));
    };
    this._slider.oninput = () => {
      if (this._realtime.checked) return;
      this._setTimeOverride(parseFloat(this._slider.value));
    };
    panel.querySelector('#dbg-fake-add').onclick = () => { this._addFake(); this._refresh(); };
    panel.querySelector('#dbg-fake-del').onclick = () => { this._removeFake(); this._refresh(); };
  }

  toggle() { this._open = !this._open; this._panel.classList.toggle('open', this._open); }

  _refresh() {
    const h = this._getHour?.() ?? 12;
    const hh = Math.floor(h) % 24;
    const mm = Math.floor((h - Math.floor(h)) * 60);
    this._timeVal.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (this._realtime.checked) this._slider.value = h.toFixed(1);
    const c = this._getCounts?.() ?? { real: 0, fake: 0 };
    this._counts.textContent = `내 방 ${c.real}명 · 생성한 가짜 ${c.fake}`;
  }

  dispose() {
    clearInterval(this._tick);
    window.removeEventListener('keydown', this._onKey);
  }
}
