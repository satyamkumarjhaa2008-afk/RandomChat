// src/app.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, RTC_ICE_SERVERS, MAX_FILE_BYTES, FILE_CHUNK_BYTES } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (id) => document.getElementById(id);
const state = {
  user: null, profile: null, chat: null, peer: null, channel: null,
  queueChannel: null, queueing: false, typingTimer: null,
  rtc: null, localStream: null, callStartedAt: null, callTimer: null,
  file: null, fileSending: false, callKind: null
};
const gsap = window.gsap;

const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const initials = (name = 'Stranger') => name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
const fmtTime = (d) => new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(d));
const toast = (message) => {
  const root = $('toast-root'); if (!root) return;
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; root.appendChild(el);
  gsap?.fromTo(el, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: .22 });
  setTimeout(() => { gsap?.to(el, { opacity: 0, y: -8, duration: .18, onComplete: () => el.remove() }) ?? el.remove(); }, 3200);
};
const show = (id) => $(id)?.classList.remove('hidden');
const hide = (id) => $(id)?.classList.add('hidden');
const icons = () => window.lucide?.createIcons();
const animateView = (id) => { const el = $(id); if (el) gsap?.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .45, ease: 'power3.out' }); };

function setAuthMode(mode) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.authMode === mode));
  $('username-field').classList.toggle('hidden', mode !== 'signup');
  $('auth-submit').querySelector('span').textContent = mode === 'signup' ? 'Create account' : 'Continue';
  $('auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('auth-form').dataset.mode = mode;
}

async function loadProfile(user) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  state.profile = data || { id: user.id, username: user.user_metadata?.username || `User-${user.id.slice(0, 6)}` };
}

function updateProfileUI() {
  const name = state.profile?.username || 'User';
  $('profile-username').textContent = name;
  $('profile-name-input').value = name;
  $('profile-email').textContent = state.user?.email || '';
  $('profile-avatar').textContent = initials(name);
}
function goHome() { hide('auth-view'); hide('chat-view'); show('home-view'); updateQueueButton(); animateView('home-view'); icons(); }
function goChat() { hide('auth-view'); hide('home-view'); show('chat-view'); animateView('chat-view'); icons(); }
function updateQueueButton() {
  const btn = $('find-btn'); if (!btn) return;
  btn.disabled = false;
  btn.querySelector('span').textContent = state.queueing ? 'Cancel search' : 'Find someone';
  btn.querySelector('i')?.setAttribute('data-lucide', state.queueing ? 'x' : 'shuffle');
  icons();
}

async function authSubmit(e) {
  e.preventDefault();
  const mode = $('auth-form').dataset.mode || 'login';
  const email = $('auth-email').value.trim(); const password = $('auth-password').value; const username = $('auth-username').value.trim();
  const button = $('auth-submit'); button.disabled = true;
  try {
    if (mode === 'signup') {
      if (username.length < 2) throw new Error('Choose a username with at least 2 characters.');
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
      if (error) throw error;
      toast(data.session ? 'Welcome to RandomChat.' : 'Check your email to confirm your account.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) { toast(err.message || 'Authentication failed.'); }
  finally { button.disabled = false; }
}
async function googleAuth() {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) toast(error.message);
}

async function leaveQueue() {
  state.queueing = false;
  if (state.queueChannel) { await state.queueChannel.unsubscribe(); state.queueChannel = null; }
  try { await supabase.rpc('leave_match_queue'); } catch {}
  updateQueueButton();
}

async function waitForMatch() {
  if (state.queueChannel) return;
  state.queueing = true; updateQueueButton();
  const channel = supabase.channel(`queue:${state.user.id}:${crypto.randomUUID()}`);
  state.queueChannel = channel;
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, async ({ new: chat }) => {
    if (!state.queueing || !chat || (chat.user_a !== state.user.id && chat.user_b !== state.user.id)) return;
    state.queueing = false;
    await channel.unsubscribe(); state.queueChannel = null;
    await enterChat(chat);
  });
  await channel.subscribe();
}

async function findSomeone() {
  if (!state.user) return;
  if (state.queueing) { await leaveQueue(); toast('Search cancelled.'); return; }
  const btn = $('find-btn'); btn.disabled = true; btn.querySelector('span').textContent = 'Finding someone…';
  try {
    await leaveQueue();
    const { data, error } = await supabase.rpc('find_match');
    if (error) throw error;
    if (data) await enterChat(data);
    else { toast('You’re in the queue. Waiting for a match…'); await waitForMatch(); }
  } catch (err) { toast(err.message || 'Could not start matchmaking.'); state.queueing = false; }
  finally { updateQueueButton(); }
}

function peerId(chat) { return chat.user_a === state.user.id ? chat.user_b : chat.user_a; }
async function enterChat(chat) {
  await leaveQueue();
  await endCall(true);
  state.chat = chat;
  const pid = peerId(chat);
  const { data, error } = await supabase.from('profiles').select('*').eq('id', pid).single();
  if (error) throw error;
  state.peer = data;
  $('peer-name').textContent = data.username || 'Stranger'; $('peer-avatar').textContent = initials(data.username);
  $('call-peer-name').textContent = data.username || 'Stranger'; $('call-avatar').textContent = initials(data.username);
  $('messages').innerHTML = '';
  goChat(); await loadMessages(); await subscribeChat();
}
async function loadMessages() {
  const { data, error } = await supabase.from('messages').select('*').eq('chat_id', state.chat.id).order('created_at', { ascending: true }).limit(200);
  if (error) { toast(error.message); return; } data?.forEach(renderMessage); scrollMessages();
}
function renderMessage(m) {
  if (!m || $('messages').querySelector(`[data-message-id="${CSS.escape(String(m.id))}"]`)) return;
  const mine = m.sender_id === state.user.id; const row = document.createElement('div'); row.className = `message-row ${mine ? 'mine' : 'theirs'}`; row.dataset.messageId = m.id;
  row.innerHTML = `<div><div class="bubble">${esc(m.body || '')}</div><div class="msg-time">${fmtTime(m.created_at)}</div></div>`;
  $('messages').appendChild(row);
}
function scrollMessages() { const box = $('messages'); box.scrollTop = box.scrollHeight; }

async function subscribeChat() {
  await closeChannel();
  state.channel = supabase.channel(`chat:${state.chat.id}`, { config: { broadcast: { self: false }, presence: { key: state.user.id } } });
  state.channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${state.chat.id}` }, ({ new: message }) => { renderMessage(message); scrollMessages(); });
  state.channel.on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload?.user_id === state.peer?.id) showTyping(Boolean(payload.typing)); });
  state.channel.on('broadcast', { event: 'system' }, ({ payload }) => { if (payload?.type === 'call-ended') endCall(true); if (payload?.type === 'chat-ended') endChat(true); });
  state.channel.on('broadcast', { event: 'signal' }, ({ payload }) => handleSignal(payload));
  state.channel.on('presence', { event: 'sync' }, () => {
    const presence = state.channel.presenceState(); const online = Object.keys(presence).includes(state.peer?.id);
    $('peer-status').innerHTML = `<span class="dot ${online ? 'live' : ''}"></span> ${online ? 'connected' : 'away'}`;
  });
  await state.channel.subscribe(async status => { if (status === 'SUBSCRIBED') await state.channel.track({ online_at: new Date().toISOString() }); });
}
async function closeChannel() { if (state.channel) { await state.channel.unsubscribe(); state.channel = null; } }

async function sendMessage(e) {
  e.preventDefault(); const input = $('message-input'); const body = input.value.trim(); if (!body || !state.chat) return;
  input.value = ''; stopTyping();
  const { error } = await supabase.from('messages').insert({ chat_id: state.chat.id, sender_id: state.user.id, body });
  if (error) { input.value = body; toast(error.message); }
}
function showTyping(on) { $('typing-bar').classList.toggle('hidden', !on); if (on) { clearTimeout(state.typingTimer); state.typingTimer = setTimeout(() => showTyping(false), 1800); } }
async function broadcastTyping(typing) { if (state.channel) try { await state.channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: state.user.id, typing } }); } catch {} }
function stopTyping() { clearTimeout(state.typingTimer); broadcastTyping(false); }

async function nextChat() {
  await finishChat(false); hide('chat-view'); show('home-view'); animateView('home-view'); await findSomeone();
}
async function endChat(silent = false) {
  if (!state.chat) return;
  if (!silent && state.channel) try { await state.channel.send({ type: 'broadcast', event: 'system', payload: { type: 'chat-ended' } }); } catch {}
  const chatId = state.chat.id;
  await endCall(true); await closeChannel();
  try { await supabase.rpc('end_chat', { p_chat_id: chatId }); } catch {}
  state.chat = null; state.peer = null;
  hide('chat-view'); show('home-view'); animateView('home-view');
}
async function finishChat(silent) {
  if (!state.chat) return;
  const chatId = state.chat.id;
  if (!silent && state.channel) try { await state.channel.send({ type: 'broadcast', event: 'system', payload: { type: 'chat-ended' } }); } catch {}
  await endCall(true); await closeChannel();
  try { await supabase.rpc('end_chat', { p_chat_id: chatId }); } catch {}
  state.chat = null; state.peer = null;
}
async function logout() {
  await leaveQueue(); await closeChannel(); await endCall(true); await supabase.auth.signOut();
  state.user = null; state.profile = null; state.chat = null; state.peer = null;
  hide('home-view'); hide('chat-view'); show('auth-view'); animateView('auth-view');
}

async function sendFile(file) {
  if (!file) return;
  if (state.fileSending) return toast('A file is already being sent.');
  if (!state.rtc?.dc || state.rtc.dc.readyState !== 'open') return toast('Start a voice/video call before sending a file.');
  if (file.size > MAX_FILE_BYTES) return toast('File is larger than 25 MB.');
  const dc = state.rtc.dc; state.fileSending = true; state.file = { name: file.name, size: file.size, type: file.type, received: 0, buffer: [] };
  $('file-preview').classList.remove('hidden'); $('file-preview').textContent = `Sending ${file.name}… 0%`;
  dc.bufferedAmountLowThreshold = FILE_CHUNK_BYTES * 2;
  dc.send(JSON.stringify({ kind: 'file-meta', name: file.name, size: file.size, type: file.type }));
  let offset = 0;
  const pump = async () => {
    while (offset < file.size) {
      if (dc.readyState !== 'open') throw new Error('File connection closed.');
      if (dc.bufferedAmount > FILE_CHUNK_BYTES * 8) { await new Promise(resolve => { const wait = () => { dc.removeEventListener('bufferedamountlow', wait); resolve(); }; dc.addEventListener('bufferedamountlow', wait, { once: true }); }); }
      const buffer = await file.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer();
      dc.send(buffer); offset += buffer.byteLength;
      $('file-preview').textContent = `Sending ${file.name}… ${Math.round(offset / file.size * 100)}%`;
    }
    dc.send(JSON.stringify({ kind: 'file-end' })); $('file-preview').textContent = `Sent ${file.name}`;
    setTimeout(() => hide('file-preview'), 2200);
  };
  try { await pump(); } catch (err) { toast(err.message || 'File transfer failed.'); hide('file-preview'); }
  finally { state.fileSending = false; $('file-input').value = ''; }
}
function setupDataChannel(dc) {
  if (!state.rtc) return; state.rtc.dc = dc; dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = FILE_CHUNK_BYTES * 2;
  dc.onopen = () => { $('file-preview').classList.remove('hidden'); $('file-preview').textContent = 'P2P link ready — you can send files.'; setTimeout(() => hide('file-preview'), 2200); };
  dc.onmessage = async e => {
    if (typeof e.data === 'string') {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.kind === 'file-meta') { state.file = { ...msg, received: 0, buffer: [] }; $('file-preview').classList.remove('hidden'); $('file-preview').textContent = `Receiving ${msg.name}… 0%`; }
      else if (msg.kind === 'file-end' && state.file) {
        const blob = new Blob(state.file.buffer, { type: state.file.type || 'application/octet-stream' }); const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = state.file.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000); $('file-preview').textContent = `Received ${state.file.name}`; setTimeout(() => hide('file-preview'), 3000);
      }
    } else if (state.file) {
      state.file.buffer.push(e.data); state.file.received += e.data.byteLength;
      $('file-preview').textContent = `Receiving ${state.file.name}… ${Math.round(state.file.received / state.file.size * 100)}%`;
    }
  };
}

async function logCallEvent(eventType) {
  if (!state.chat) return;
  const { error } = await supabase.from('call_events').insert({ chat_id: state.chat.id, sender_id: state.user.id, event_type: eventType });
  if (error) console.warn('call_events:', error.message);
}
async function createPeer(initiator, video) {
  if (!state.channel || !state.peer) return;
  if (state.rtc?.pc) state.rtc.pc.close();
  const pc = new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
  const dc = initiator ? pc.createDataChannel('files', { ordered: true }) : null;
  state.rtc = { pc, dc: null, initiator, video, iceReady: false };
  if (dc) setupDataChannel(dc);
  pc.onicecandidate = e => { if (e.candidate) state.channel?.send({ type: 'broadcast', event: 'signal', payload: { from: state.user.id, to: state.peer.id, signal: { type: 'candidate', candidate: e.candidate } } }); };
  pc.ontrack = e => { if (e.streams[0]) { $('remote-video').srcObject = e.streams[0]; $('remote-placeholder').classList.add('hidden'); } };
  pc.ondatachannel = e => setupDataChannel(e.channel);
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') { $('call-state').textContent = 'Connected'; $('call-label').textContent = video ? 'Video call' : 'Voice call'; }
    else if (['failed', 'disconnected', 'closed'].includes(s)) endCall(true);
  };
  if (state.localStream) state.localStream.getTracks().forEach(t => pc.addTrack(t, state.localStream));
  if (initiator) {
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    await state.channel.send({ type: 'broadcast', event: 'signal', payload: { from: state.user.id, to: state.peer.id, signal: { type: 'offer', sdp: offer.sdp, video } } });
  }
}
async function handleSignal(payload) {
  if (!payload || payload.to !== state.user.id || !state.peer) return;
  const sig = payload.signal;
  try {
    if (sig.type === 'offer') {
      await createPeer(false, Boolean(sig.video)); await state.rtc.pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
      const answer = await state.rtc.pc.createAnswer(); await state.rtc.pc.setLocalDescription(answer);
      await state.channel.send({ type: 'broadcast', event: 'signal', payload: { from: state.user.id, to: state.peer.id, signal: { type: 'answer', sdp: answer.sdp } } });
    } else if (sig.type === 'answer' && state.rtc?.pc) await state.rtc.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
    else if (sig.type === 'candidate' && state.rtc?.pc) await state.rtc.pc.addIceCandidate(sig.candidate);
  } catch (err) { console.warn('WebRTC signal:', err); }
}
async function startCall(video) {
  if (!state.chat || state.rtc) return toast('A call is already active.');
  try {
    state.callKind = video ? 'video' : 'voice'; state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    $('local-video').srcObject = state.localStream; $('local-video').classList.toggle('hidden', !video); $('remote-video').classList.toggle('hidden', !video);
    $('remote-placeholder').classList.remove('hidden'); $('call-state').textContent = 'Calling…'; $('call-label').textContent = video ? 'Video call' : 'Voice call';
    $('toggle-camera').classList.toggle('hidden', !video); show('call-modal'); state.callStartedAt = Date.now();
    clearInterval(state.callTimer); state.callTimer = setInterval(() => { const s = Math.floor((Date.now() - state.callStartedAt) / 1000); $('call-timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    await logCallEvent('started'); await createPeer(true, video);
  } catch (err) { toast(err.name === 'NotAllowedError' ? 'Camera/microphone permission was denied.' : err.message || 'Could not start call.'); await endCall(true); }
}
async function endCall(silent = false) {
  if (!state.rtc && !state.localStream && $('call-modal').classList.contains('hidden')) return;
  if (state.channel && !silent) try { await state.channel.send({ type: 'broadcast', event: 'system', payload: { type: 'call-ended' } }); } catch {}
  if (state.rtc?.pc) state.rtc.pc.close(); state.rtc = null;
  if (state.localStream) state.localStream.getTracks().forEach(t => t.stop()); state.localStream = null;
  if (!silent) await logCallEvent('ended');
  clearInterval(state.callTimer); state.callTimer = null; state.callStartedAt = null; state.callKind = null;
  $('remote-video').srcObject = null; $('local-video').srcObject = null; hide('call-modal'); $('call-timer').textContent = '00:00';
}
function toggleMic() { const t = state.localStream?.getAudioTracks()[0]; if (!t) return; t.enabled = !t.enabled; $('toggle-mic').classList.toggle('active', t.enabled); }
function toggleCamera() { const t = state.localStream?.getVideoTracks()[0]; if (!t) return; t.enabled = !t.enabled; $('toggle-camera').classList.toggle('active', t.enabled); }

function profileModal() { updateProfileUI(); show('profile-modal'); gsap?.from('.profile-window', { scale: .96, opacity: 0, duration: .25, ease: 'power2.out' }); }
async function saveProfile() {
  const name = $('profile-name-input').value.trim(); if (name.length < 2) return toast('Choose a display name with at least 2 characters.');
  const { error } = await supabase.from('profiles').update({ username: name }).eq('id', state.user.id);
  if (error) return toast(error.message); state.profile.username = name; updateProfileUI(); hide('profile-modal'); toast('Profile updated.');
}

function safetyModal() { if (!state.peer) return; $('report-reason').value = ''; show('safety-modal'); }
async function reportPeer() {
  const reason = $('report-reason').value.trim(); if (reason.length < 3) return toast('Please choose or enter a reason.');
  const { error } = await supabase.from('reports').insert({ reporter_id: state.user.id, reported_user_id: state.peer.id, chat_id: state.chat?.id || null, reason });
  if (error) return toast(error.message); hide('safety-modal'); toast('Report submitted. Thank you.');
}
async function blockPeer() {
  if (!state.peer) return;
  const { error } = await supabase.from('blocks').insert({ user_id: state.user.id, blocked_user_id: state.peer.id });
  if (error && error.code !== '23505') return toast(error.message);
  hide('safety-modal'); toast('User blocked. You won’t be matched with them again.'); await endChat();
}

$('auth-form').dataset.mode = 'login';
document.querySelectorAll('[data-auth-mode]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.authMode)));
$('auth-form').addEventListener('submit', authSubmit); $('google-auth').addEventListener('click', googleAuth); $('logout-btn').addEventListener('click', logout);
$('find-btn').addEventListener('click', findSomeone); $('message-form').addEventListener('submit', sendMessage); $('message-input').addEventListener('input', () => broadcastTyping(true));
$('message-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('message-form').requestSubmit(); } });
$('next-chat').addEventListener('click', nextChat); $('more-chat').addEventListener('click', safetyModal); $('audio-call').addEventListener('click', () => startCall(false)); $('video-call').addEventListener('click', () => startCall(true));
$('end-call').addEventListener('click', () => endCall(false)); $('toggle-mic').addEventListener('click', toggleMic); $('toggle-camera').addEventListener('click', toggleCamera);
$('profile-btn').addEventListener('click', profileModal); $('close-profile').addEventListener('click', () => hide('profile-modal')); $('save-profile').addEventListener('click', saveProfile);
$('attach-btn').addEventListener('click', () => $('file-input').click()); $('file-input').addEventListener('change', e => sendFile(e.target.files[0]));
$('emoji-btn').addEventListener('click', () => { const input = $('message-input'); input.value += ' 👋'; input.focus(); }); $('close-safety').addEventListener('click', () => hide('safety-modal')); $('cancel-safety').addEventListener('click', () => hide('safety-modal'));
$('report-peer').addEventListener('click', reportPeer); $('block-peer').addEventListener('click', blockPeer);

autoFocus();
function autoFocus() { setTimeout(() => $('auth-email')?.focus(), 250); }

async function boot() {
  icons();
  const { data } = await supabase.auth.getSession();
  if (data.session) { state.user = data.session.user; try { await loadProfile(state.user); updateProfileUI(); goHome(); } catch (e) { toast(e.message); } }
  else { show('auth-view'); animateView('auth-view'); }
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) { state.user = session.user; try { await loadProfile(state.user); updateProfileUI(); goHome(); } catch (e) { toast(e.message); } }
  });
}
boot();
