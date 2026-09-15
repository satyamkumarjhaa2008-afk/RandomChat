// src/main.tsx
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import type { Chat, Message, Profile, Report } from './types';
import './styles.css';

const MAX_MESSAGE = 2000;
const MIN_PASSWORD = 8;
type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';
type Screen = 'auth' | 'home' | 'chat';
type Connection = 'online' | 'offline' | 'reconnecting';

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const initials = (name = 'Stranger') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
const formatTime = (value: string) => new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [peer, setPeer] = useState<Profile | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [screen, setScreen] = useState<Screen>('auth');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [reason, setReason] = useState('Harassment or bullying');
  const [connection, setConnection] = useState<Connection>(navigator.onLine ? 'online' : 'offline');
  const [newMessages, setNewMessages] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const queueRef = useRef<RealtimeChannel | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageBoxRef = useRef<HTMLDivElement>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const restoreInFlightRef = useRef(false);

  const toast = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 3200);
  }, []);

  const cleanupChannels = useCallback(async () => {
    const channels = [queueRef.current, channelRef.current].filter((value): value is RealtimeChannel => value !== null);
    queueRef.current = null;
    channelRef.current = null;
    await Promise.all(channels.map((channel) => supabase.removeChannel(channel)));
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('id,username,created_at').eq('id', userId).maybeSingle();
    if (error) throw error;
    setProfile(data);
    return data;
  }, []);

  const enterChat = useCallback(async (nextChat: Chat, activeSession: Session) => {
    if (nextChat.status !== 'active' || (nextChat.user_a !== activeSession.user.id && nextChat.user_b !== activeSession.user.id)) return;
    await cleanupChannels();
    const peerId = nextChat.user_a === activeSession.user.id ? nextChat.user_b : nextChat.user_a;
    const [{ data: peerData, error: peerError }, { data: history, error: historyError }] = await Promise.all([
      supabase.from('profiles').select('id,username,created_at').eq('id', peerId).single(),
      supabase.from('messages').select('id,chat_id,sender_id,body,created_at').eq('chat_id', nextChat.id).order('created_at', { ascending: true }).limit(200),
    ]);
    if (peerError) throw peerError;
    if (historyError) throw historyError;
    setChat(nextChat);
    setPeer(peerData);
    setMessages(history ?? []);
    setNewMessages(0);
    setSearching(false);
    setScreen('chat');
    setConnection('online');

    const channel = supabase.channel(`chat:${nextChat.id}`);
    channelRef.current = channel;
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${nextChat.id}` }, (payload) => {
      const message = payload.new as Message;
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        const box = messageBoxRef.current;
        const nearBottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
        if (!nearBottom && message.sender_id !== activeSession.user.id) setNewMessages((count) => count + 1);
        return [...current, message];
      });
    });
    channel.on('broadcast', { event: 'ended' }, () => {
      setChat(null); setPeer(null); setMessages([]); setNewMessages(0); setSearching(false); setScreen('home'); toast('Your stranger ended the chat.');
    });
    await channel.subscribe((state) => {
      if (state === 'SUBSCRIBED') setConnection('online');
      else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') setConnection('reconnecting');
      else if (state === 'CLOSED') setConnection('offline');
    });
  }, [cleanupChannels, toast]);

  const restore = useCallback(async (activeSession: Session) => {
    if (restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;
    try {
      const loadedProfile = await loadProfile(activeSession.user.id);
      if (!loadedProfile) { toast('Your profile could not be loaded. Please try again.'); return; }
      const { data, error } = await supabase.from('chats').select('id,user_a,user_b,status,created_at,ended_at').eq('status', 'active').or(`user_a.eq.${activeSession.user.id},user_b.eq.${activeSession.user.id}`).limit(1).maybeSingle();
      if (error) throw error;
      if (data) await enterChat(data, activeSession);
      else { setChat(null); setPeer(null); setMessages([]); setSearching(false); setScreen('home'); }
    } catch (error) {
      toast(getErrorMessage(error, 'Could not restore your session.'));
      setScreen('home');
    } finally { restoreInFlightRef.current = false; }
  }, [enterChat, loadProfile, toast]);

  const rejoinRealtime = useCallback(async () => {
    if (!session || !chat || !navigator.onLine) return;
    setConnection('reconnecting');
    try { await enterChat(chat, session); }
    catch (error) { setConnection('offline'); toast(getErrorMessage(error, 'Realtime connection could not be restored.')); }
  }, [chat, enterChat, session, toast]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let mounted = true;
    const isRecoveryPath = window.location.pathname === '/reset-password';
    if (isRecoveryPath) { setScreen('auth'); setAuthMode('reset'); }
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) { setSession(data.session); if (!isRecoveryPath) void restore(data.session); }
      else if (!isRecoveryPath) setScreen('auth');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') { setScreen('auth'); setAuthMode('reset'); setPassword(''); return; }
      if (nextSession) {
        if (event !== 'INITIAL_SESSION' || window.location.pathname !== '/reset-password') void restore(nextSession);
      } else {
        void cleanupChannels(); setProfile(null); setChat(null); setPeer(null); setMessages([]); setSearching(false); setScreen('auth'); setAuthMode('login');
      }
    });
    const onOnline = () => {
      setConnection('online');
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => void rejoinRealtime(), 250);
    };
    const onOffline = () => setConnection('offline');
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { mounted = false; subscription.unsubscribe(); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current); if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current); void cleanupChannels(); };
  }, [cleanupChannels, rejoinRealtime, restore]);

  const leaveQueue = useCallback(async () => {
    setSearching(false);
    if (queueRef.current) { await supabase.removeChannel(queueRef.current); queueRef.current = null; }
    if (session) { const { error } = await supabase.rpc('leave_match_queue'); if (error) toast(getErrorMessage(error, 'Could not cancel search.')); }
  }, [session, toast]);

  const find = useCallback(async () => {
    if (!session || busy) return;
    if (searching) { await leaveQueue(); toast('Search cancelled.'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('find_match');
      if (error) throw error;
      if (data) await enterChat(data, session);
      else {
        setSearching(true);
        const channel = supabase.channel(`queue:${session.user.id}`);
        queueRef.current = channel;
        channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload) => {
          const nextChat = payload.new as Chat;
          if (nextChat.status === 'active' && (nextChat.user_a === session.user.id || nextChat.user_b === session.user.id)) void enterChat(nextChat, session);
        });
        await channel.subscribe((state) => { if (state === 'SUBSCRIBED') setConnection('online'); else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') setConnection('reconnecting'); });
        toast('Looking for someone…');
      }
    } catch (error) { setSearching(false); toast(getErrorMessage(error, 'Could not start matchmaking.')); }
    finally { setBusy(false); }
  }, [busy, enterChat, leaveQueue, searching, session, toast]);

  const endChat = useCallback(async (rejoin = false) => {
    if (!chat || !session || busy) return;
    const currentChat = chat;
    setBusy(true);
    try {
      if (channelRef.current) await channelRef.current.send({ type: 'broadcast', event: 'ended', payload: {} });
      const { error } = await supabase.rpc('end_chat', { p_chat_id: currentChat.id });
      if (error) throw error;
      await cleanupChannels();
      setChat(null); setPeer(null); setMessages([]); setNewMessages(0); setScreen('home');
      if (rejoin) window.setTimeout(() => void find(), 100);
    } catch (error) { toast(getErrorMessage(error, 'Could not end the chat.')); }
    finally { setBusy(false); }
  }, [busy, chat, cleanupChannels, find, session, toast]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!chat || !session || busy || connection !== 'online') return;
    const body = text.trim();
    if (!body) return;
    if (body.length > MAX_MESSAGE) { toast(`Messages are limited to ${MAX_MESSAGE} characters.`); return; }
    setText('');
    const { error } = await supabase.from('messages').insert({ chat_id: chat.id, sender_id: session.user.id, body });
    if (error) { setText(body); toast(getErrorMessage(error, 'Message could not be sent.')); }
  };

  const authenticate = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      if (authMode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast('If that email exists, a secure reset link is on its way.'); setAuthMode('login'); return;
      }
      if (authMode === 'reset') {
        if (password.length < MIN_PASSWORD) throw new Error(`Use a password with at least ${MIN_PASSWORD} characters.`);
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        window.history.replaceState({}, document.title, '/');
        toast('Password updated successfully.'); setPassword(''); setAuthMode('login');
        if (session) void restore(session);
        return;
      }
      if (authMode === 'signup') {
        const cleanUsername = username.trim();
        if (cleanUsername.length < 2 || cleanUsername.length > 24) throw new Error('Choose a username with 2–24 characters.');
        if (password.length < MIN_PASSWORD) throw new Error(`Use a password with at least ${MIN_PASSWORD} characters.`);
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: cleanUsername } } });
        if (error) throw error;
        if (!data.session) toast('Account created. Check your email to verify your address.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) { toast(getErrorMessage(error, 'Authentication failed.')); }
    finally { setBusy(false); }
  };

  const google = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) { toast(getErrorMessage(error, 'Google sign-in failed.')); setBusy(false); }
  };

  const saveProfile = async () => {
    if (!profile || busy) return;
    const name = profile.username.trim();
    if (name.length < 2 || name.length > 24) { toast('Username must be 2–24 characters.'); return; }
    setBusy(true);
    const { data, error } = await supabase.from('profiles').update({ username: name }).eq('id', profile.id).select('id,username,created_at').single();
    setBusy(false);
    if (error) toast(error.code === '23505' ? 'That username is already taken.' : getErrorMessage(error, 'Could not update profile.'));
    else { setProfile(data); setShowProfile(false); toast('Profile updated.'); }
  };

  const report = async () => {
    if (!peer || !session || busy) return;
    const reportRow: Omit<Report, 'id' | 'created_at'> = { reporter_id: session.user.id, reported_user_id: peer.id, chat_id: chat?.id ?? null, reason: reason.trim() };
    setBusy(true);
    const { error } = await supabase.from('reports').insert(reportRow);
    setBusy(false);
    if (error) toast(getErrorMessage(error, 'Could not submit report.')); else { setShowSafety(false); toast('Report submitted. Thank you.'); }
  };

  const block = async () => {
    if (!peer || !session || busy) return;
    setBusy(true);
    const { error } = await supabase.from('blocks').insert({ user_id: session.user.id, blocked_user_id: peer.id });
    setBusy(false);
    if (error && error.code !== '23505') { toast(getErrorMessage(error, 'Could not block this user.')); return; }
    setShowSafety(false); toast('User blocked.'); await endChat(false);
  };

  useEffect(() => {
    const box = messageBoxRef.current;
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (nearBottom) { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setNewMessages(0); }
  }, [messages]);

  if (!supabaseConfigured) return <main className="center"><div className="panel"><h1>RandomChat</h1><p>Supabase is not configured.</p><code>VITE_SUPABASE_URL<br />VITE_SUPABASE_PUBLISHABLE_KEY</code></div></main>;

  return <main className="app">
    {notice && <div className="toast" role="status" aria-live="polite">{notice}</div>}
    {screen === 'auth' && <section className="auth page"><div className="brand"><span className="mark">RC</span> Random<span>Chat</span></div><div className="auth-card panel">
      <div className="eyebrow">MEET SOMEONE NEW</div>
      <h1>{authMode === 'forgot' ? 'Reset your password.' : authMode === 'reset' ? 'Choose a new password.' : <>One stranger.<br /><span>One conversation.</span></>}</h1>
      <p className="muted">{authMode === 'forgot' ? 'Enter your email and we’ll send a secure reset link.' : 'Start talking with someone you’ve never met, instantly.'}</p>
      {(authMode === 'login' || authMode === 'signup') && <div className="tabs"><button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Log in</button><button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Create account</button></div>}
      <form onSubmit={authenticate}>
        {authMode !== 'reset' && <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" /></label>}
        {authMode !== 'forgot' && <label>{authMode === 'reset' ? 'New password' : 'Password'}<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={MIN_PASSWORD} required autoComplete={authMode === 'signup' || authMode === 'reset' ? 'new-password' : 'current-password'} /></label>}
        {authMode === 'signup' && <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={24} minLength={2} required autoComplete="nickname" /></label>}
        <button className="primary wide" disabled={busy}>{busy ? 'Working…' : authMode === 'forgot' ? 'Send reset link' : authMode === 'reset' ? 'Update password' : authMode === 'signup' ? 'Create account' : 'Continue'}</button>
      </form>
      {authMode === 'login' && <><button className="secondary wide" onClick={google} disabled={busy}>Continue with Google</button><button className="link-button" onClick={() => setAuthMode('forgot')}>Forgot password?</button></>}
      {(authMode === 'forgot' || authMode === 'reset') && <button className="link-button" onClick={() => setAuthMode('login')}>Back to login</button>}
      <small>Be respectful. Never share sensitive information with strangers.</small>
    </div></section>}
    {screen === 'home' && <section className="page"><header><div className="brand"><span className="mark">RC</span> Random<span>Chat</span></div><div className="actions"><button className="secondary" onClick={() => setShowProfile(true)}>Profile</button><button className="secondary" onClick={() => void supabase.auth.signOut()}>Log out</button></div></header>
      <div className="home-grid"><section className="hero panel"><div className="eyebrow">RANDOM MATCHMAKING</div><h2>Who will you<br /><span>meet today?</span></h2><p className="muted">No feeds. No follower counts. Just one real conversation at a time.</p><button className="primary hero-button" disabled={busy} onClick={() => void find()}>{searching ? 'Cancel search' : 'Find someone'} <b>↗</b></button><div className="safety"><span>✓ Report & block</span><span>✓ Private conversations</span></div></section><aside className="panel how"><h3>How it works</h3><div><b>01</b><p><strong>Find someone</strong><br />Join the live matchmaking queue.</p></div><div><b>02</b><p><strong>Get paired</strong><br />A private room is created for two.</p></div><div><b>03</b><p><strong>Talk freely</strong><br />Skip anytime. You’re always in control.</p></div></aside></div>
      </section>}
    {screen === 'chat' && chat && peer && session && <section className="chat"><header><div className="person"><div className="avatar">{initials(peer.username)}</div><div><strong>{peer.username}</strong><small><i className={connection === 'offline' ? 'offline' : ''} /> {connection === 'online' ? 'connected' : connection === 'reconnecting' ? 'reconnecting…' : 'offline'}</small></div></div><div className="actions"><button className="secondary" onClick={() => setShowSafety(true)} disabled={busy}>Safety</button><button className="secondary" onClick={() => void endChat(true)} disabled={busy}>Next</button></div></header>
      <div className="messages" ref={messageBoxRef} role="log" aria-live="polite">{messages.length === 0 && <div className="empty"><div className="avatar big">{initials(peer.username)}</div><h3>Say hello to {peer.username}.</h3><p className="muted">This is a private conversation between the two of you.</p></div>}{messages.map((message) => <div className={`message ${message.sender_id === session.user.id ? 'mine' : ''}`} key={message.id}><div className="bubble">{message.body}</div><time>{formatTime(message.created_at)}</time></div>)}<div ref={bottomRef} /></div>
      {newMessages > 0 && <button className="new-messages" onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setNewMessages(0); }}>{newMessages} new {newMessages === 1 ? 'message' : 'messages'}</button>}
      <form className="composer" onSubmit={send}><input value={text} onChange={(event) => setText(event.target.value)} maxLength={MAX_MESSAGE} placeholder="Say hello…" autoComplete="off" aria-label="Message" disabled={connection !== 'online' || busy} /><button className="primary" disabled={!text.trim() || connection !== 'online' || busy}>Send</button></form>
      {showSafety && <div className="overlay" role="presentation" onMouseDown={() => setShowSafety(false)}><div className="panel modal" role="dialog" aria-modal="true" aria-labelledby="safety-title" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setShowSafety(false)} aria-label="Close safety dialog">×</button><h3 id="safety-title">Safety</h3><p className="muted">Help keep RandomChat welcoming.</p><label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}><option>Harassment or bullying</option><option>Spam or scam</option><option>Inappropriate content</option><option>Threatening behaviour</option><option>Other</option></select></label><div className="modal-actions"><button className="secondary" onClick={() => void report()} disabled={busy}>Report</button><button className="danger" onClick={() => void block()} disabled={busy}>Block & leave</button></div></div></div>}
    </section>}
    {showProfile && profile && <div className="overlay" role="presentation" onMouseDown={() => setShowProfile(false)}><div className="panel modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setShowProfile(false)} aria-label="Close profile dialog">×</button><h3 id="profile-title">Your profile</h3><p className="muted">This is the name strangers see.</p><label>Username<input value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} maxLength={24} minLength={2} /></label><div className="modal-actions"><button className="secondary" onClick={() => setShowProfile(false)} disabled={busy}>Cancel</button><button className="primary" onClick={() => void saveProfile()} disabled={busy}>Save</button></div></div></div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
