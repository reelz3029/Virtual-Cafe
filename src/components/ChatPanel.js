/**
 * components/ChatPanel.js
 * 채팅 패널 — 전체 채팅 / 합석 채팅 탭
 */

import { store, toggleChat } from '../store/gameStore.js';
import { multiplayerSim } from '../systems/multiplayerSim.js';

export class ChatPanel {
  constructor(container) {
    this.container  = container;
    this._el        = null;
    this._unsub     = null;
    this._activeTab = 'global'; // 'global' | 'table'
    this._lastMsgId = { global: null, table: null };

    this._render();
    this._unsub = store.subscribe(state => this._syncState(state));
  }

  _render() {
    this._el = document.createElement('div');
    this._el.className = 'chat-wrapper';
    this._el.innerHTML = this._getHTML();
    this.container.appendChild(this._el);
    this._bindEvents();
  }

  _getHTML() {
    const { chatMessages, auth } = store.getState();
    const myId = auth.user?.id;
    return `
<style>
.chat-wrapper {
  position: fixed;
  right: 16px;
  bottom: 80px;
  width: 300px;
  max-height: 440px;
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(196,160,106,0.28);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(26,15,8,0.12);
  overflow: hidden;
  animation: slideInRight 0.3s cubic-bezier(0.16,1,0.3,1) both;
  z-index: 20;
}
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px 9px;
  border-bottom: 1px solid rgba(196,160,106,0.18);
  flex-shrink: 0;
}
.chat-header-title {
  font-size: 13px; font-weight: 600; color: #3C2810;
  display: flex; align-items: center; gap: 6px;
}
.chat-header-right { display: flex; align-items: center; gap: 6px; }
.btn-leave-table {
  padding: 4px 8px;
  border-radius: 6px; border: 1px solid rgba(212,96,90,0.35);
  background: rgba(255,240,238,0.9); color: #C03030;
  font-size: 10.5px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  transition: background 0.15s;
  display: none;
}
.btn-leave-table:hover { background: rgba(212,96,90,0.12); }
.btn-close-chat {
  width: 24px; height: 24px; border-radius: 6px; border: none;
  background: #F7F0E0; color: #7A5A28; cursor: pointer;
  font-size: 12px; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.btn-close-chat:hover { background: #EDE3CC; }

/* 탭 */
.chat-tabs {
  display: flex; padding: 0 10px; flex-shrink: 0;
  border-bottom: 1px solid rgba(196,160,106,0.15);
}
.chat-tab {
  flex: 1; padding: 7px 4px;
  font-size: 11.5px; font-weight: 500; color: #A07840;
  background: transparent; border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer; transition: all 0.15s;
  font-family: inherit; text-align: center;
}
.chat-tab:hover:not(:disabled) { color: #5A3E18; }
.chat-tab.active { color: #5A3E18; border-bottom-color: #7A5A28; }
.chat-tab:disabled { color: #D4C4A0; cursor: not-allowed; }

/* 메시지 리스트 */
.chat-messages {
  flex: 1; overflow-y: auto;
  padding: 10px 10px 6px;
  display: flex; flex-direction: column; gap: 6px;
  min-height: 160px; max-height: 240px;
}
.chat-messages::-webkit-scrollbar { width: 3px; }
.chat-messages::-webkit-scrollbar-thumb { background: rgba(196,160,106,0.3); border-radius: 3px; }

.chat-msg { display: flex; flex-direction: column; gap: 2px; animation: fadeInUp 0.2s ease both; }
.chat-msg.mine { align-items: flex-end; }
.chat-msg.other { align-items: flex-start; }
.chat-msg-meta { font-size: 10px; color: #C4A06A; display: flex; align-items: center; gap: 4px; }
.chat-msg.mine .chat-msg-meta { flex-direction: row-reverse; }
.chat-msg-bubble {
  max-width: 210px; padding: 7px 11px;
  border-radius: 12px; font-size: 12.5px; line-height: 1.45; word-break: break-word;
}
.chat-msg.mine .chat-msg-bubble  { background: #7A5A28; color: #F7F0E0; border-bottom-right-radius: 4px; }
.chat-msg.other .chat-msg-bubble { background: #F7F0E0; color: #3C2810; border-bottom-left-radius: 4px; }

.chat-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
  color: #C4A06A; font-size: 12px; padding: 20px; text-align: center;
}
.chat-empty-icon { font-size: 28px; }

/* 입력창 */
.chat-input-area {
  display: flex; gap: 6px; padding: 10px;
  border-top: 1px solid rgba(196,160,106,0.15); flex-shrink: 0;
}
.chat-input {
  flex: 1; padding: 8px 11px;
  font-family: 'DM Sans', sans-serif; font-size: 12.5px; color: #3C2810;
  background: #FDFAF4; border: 1.5px solid rgba(196,160,106,0.25);
  border-radius: 9px; outline: none; transition: border-color 0.15s; resize: none;
}
.chat-input::placeholder { color: #C4A06A; }
.chat-input:focus { border-color: #A07840; background: #FFF; }
.btn-chat-send {
  width: 34px; height: 34px; flex-shrink: 0;
  border-radius: 9px; border: none; background: #7A5A28; color: #F7F0E0;
  cursor: pointer; font-size: 14px; transition: all 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.btn-chat-send:hover { background: #5A3E18; transform: scale(1.05); }
.btn-chat-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
</style>

<div class="chat-header">
  <div class="chat-header-title">💬 채팅</div>
  <div class="chat-header-right">
    <button class="btn-leave-table" id="btn-leave-table">🚪 나가기</button>
    <button class="btn-close-chat" id="btn-close-chat">✕</button>
  </div>
</div>

<div class="chat-tabs">
  <button class="chat-tab active" data-tab="global">전체 채팅</button>
  <button class="chat-tab" data-tab="table" id="tab-table" disabled>합석 채팅</button>
</div>

<div class="chat-messages" id="chat-messages">
  ${this._renderMessages(chatMessages, myId)}
</div>

<div class="chat-input-area">
  <textarea class="chat-input" id="chat-input" placeholder="메시지 입력... (Enter 전송)" rows="1" maxlength="100"></textarea>
  <button class="btn-chat-send" id="btn-chat-send">↑</button>
</div>
`;
  }

  _renderMessages(messages, myId) {
    if (!messages?.length) {
      return `
        <div class="chat-empty">
          <div class="chat-empty-icon">☕</div>
          <div>아직 메시지가 없어요</div>
          <div style="font-size:11px;color:#DCC9A0">먼저 말을 걸어보세요!</div>
        </div>`;
    }
    return messages.slice(-50).map(msg => this._renderOne(msg, myId)).join('');
  }

  _renderOne(msg, myId) {
    const isMe = msg.from === myId;
    const time = msg.timestamp
      ? new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : '';
    return `
      <div class="chat-msg ${isMe ? 'mine' : 'other'}">
        <div class="chat-msg-meta">
          <span>${isMe ? '나' : this._esc(msg.fromName ?? '')}</span>
          <span>${time}</span>
        </div>
        <div class="chat-msg-bubble">${this._esc(msg.text ?? '')}</div>
      </div>`;
  }

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _bindEvents() {
    this._el.querySelector('#btn-close-chat')?.addEventListener('click', () => toggleChat(false));

    this._el.querySelector('#btn-leave-table')?.addEventListener('click', () => {
      multiplayerSim.leaveTable();
    });

    // 탭 전환
    this._el.querySelectorAll('.chat-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this._switchTab(btn.dataset.tab);
      });
    });

    const sendBtn = this._el.querySelector('#btn-chat-send');
    const input   = this._el.querySelector('#chat-input');

    sendBtn?.addEventListener('click', () => this._sendMessage());
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 72) + 'px';
    });
  }

  _switchTab(tab) {
    this._activeTab = tab;

    // 탭 active 스타일
    this._el.querySelectorAll('.chat-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // 입력 placeholder
    const input = this._el.querySelector('#chat-input');
    if (input) {
      input.placeholder = tab === 'table'
        ? '합석 채팅... (Enter 전송)'
        : '메시지 입력... (Enter 전송)';
    }

    // 메시지 다시 그리기
    const { chatMessages, tableChatMessages, auth } = store.getState();
    const msgs = tab === 'table' ? tableChatMessages : chatMessages;
    const myId = auth.user?.id;
    const messagesEl = this._el.querySelector('#chat-messages');
    if (messagesEl) {
      messagesEl.innerHTML = this._renderMessages(msgs, myId);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // lastMsgId 초기화 (탭 전환 시 전체 재렌더)
    this._lastMsgId[tab] = msgs.length ? msgs[msgs.length - 1].id : null;
  }

  _sendMessage() {
    const input = this._el.querySelector('#chat-input');
    const text  = input?.value?.trim();
    if (!text) return;

    if (this._activeTab === 'table') {
      multiplayerSim.sendTableChat(text);
    } else {
      multiplayerSim.sendChat(text);
    }

    input.value = '';
    input.style.height = 'auto';
  }

  _syncState(state) {
    const { chatMessages, tableChatMessages, myTableId, auth } = state;
    const myId = auth.user?.id;

    // 테이블 탭 활성화/비활성화
    const tableTab  = this._el.querySelector('#tab-table');
    const leaveBtn  = this._el.querySelector('#btn-leave-table');
    if (tableTab) tableTab.disabled = !myTableId;
    if (leaveBtn) leaveBtn.style.display = myTableId ? '' : 'none';

    // 테이블에서 나갔는데 합석 탭이 켜져 있으면 전체 탭으로 전환
    if (!myTableId && this._activeTab === 'table') {
      this._switchTab('global');
      return;
    }

    // 현재 탭 메시지만 업데이트
    const msgs    = this._activeTab === 'table' ? tableChatMessages : chatMessages;
    if (!msgs.length) return;

    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.id === this._lastMsgId[this._activeTab]) return;

    const messagesEl = this._el.querySelector('#chat-messages');
    if (!messagesEl) return;

    const prevId  = this._lastMsgId[this._activeTab];
    const prevIdx = prevId ? msgs.findIndex(m => m.id === prevId) : -1;

    if (prevIdx === -1) {
      messagesEl.innerHTML = this._renderMessages(msgs, myId);
    } else {
      const empty = messagesEl.querySelector('.chat-empty');
      if (empty) messagesEl.innerHTML = '';
      msgs.slice(prevIdx + 1).forEach(msg => {
        messagesEl.insertAdjacentHTML('beforeend', this._renderOne(msg, myId));
      });
    }

    this._lastMsgId[this._activeTab] = lastMsg.id;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  destroy() {
    this._unsub?.();
    this._el?.remove();
  }
}
