// src/main.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { RealtimeChannel, RealtimePostgresInsertPayload, Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import type { Chat, Message, Profile, Report } from './types';
import './styles.css';

const MAX_MESSAGE = 2000;
type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';
type Screen = 'auth' | 'home' | 'chat';
type ChatInsert = Chat;
const initials = (name = 'Stranger') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
const formatTime = (value: string) => new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const messagePayload = (payload: RealtimePostgresInsertPayload<Message>): Message => payload.new;
const chatPayload = (payload: RealtimePostgresInsertPayload<ChatInsert>): Chat => payload.new;

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
  const [connection, setConnection] = useState<'online' | 'offline'>('online');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const queueRef = useRef<RealtimeChannel | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageBoxRef = useRef<HTMLDivElement>(null);

  const toast = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3200);
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('id,username,created_at').eq('id', userId).maybeSingle();
    if (error) throw error;
    const value = data as Profile | null;
    setProfile(value);
    return value;
  }, []);

  const cleanupChannels = useCallback(async () => {
    if (queueRef.current) { await queueRef.current.unsubscribe(); queueRef.current = null; }
    if (channelRef.current) { await channelRef.current.unsubscribe(); channelRef.current = null; }
  }, []);

  const enterChat = useCallback(async (nextChat: Chat, activeSession: Session) => {
    await cleanupChannels();
    const peerId = nextChat.user_a === activeSession.user.id ? nextChat.user_b : nextChat.user_a;
    const { data: peerData, error: peerError } = await supabase.from('profiles').select('id,username,created_at').eq('id', peerId).single();
    if (peerError) throw peerError;
    const { data: history, error: historyError } = await supabase.from('messages').select('*').eq('chat_id', nextChat.id).order('created_at', { ascending: true }).limit(200);
    if (historyError) throw historyError;
    setChat(nextChat);
    setPeer(peerData as Profile);
    setMessages((history ?? []) as Message[]);
    setSearching(false);
    setScreen('chat');
    const channel = supabase.channel(`chat:${nextChat.id}`);
    channelRef.current = channel;
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${nextChat.id}` }, (payload) => {
      const message = messagePayload(payload as RealtimePostgresInsertPayload<Message>);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    });
    channel.on('broadcast', { event: 'ended' }, () => {
      setChat(null); setPeer(null); setMessages([]); setScreen('home'); toast('Your stranger ended the chat.');
    });
    const status = await channel.subscribe((state) => setConnection(state === 'SUBSCRIBED' ? 'online' : 'offline'));
    if (status !== 'ok') setConnection('offline');
  }, [cleanupChannels, toast]);

  const restore = useCallback(async (activeSession: Session) => {
    try {
      await loadProfile(activeSession.user.id);
      const { data, error } = await supabase.from('chats').select('*').eq('status', 'active').or(`user_a.eq.${activeSession.user.id},user_b.eq.${activeSession.user.id}`).maybeSingle();
      if (error) throw error;
      if (data) await enterChat(data as Chat, activeSession);
      else setScreen('home');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not restore your session.');
      setScreen('home');
    }
  }, [enterChat, loadProfile, toast]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) { setSession(data.session); void restore(data.session); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) void restore(nextSession);
      else { void cleanupChannels(); setProfile(null); setChat(null); setPeer(null); setMessages([]); setScreen('auth'); setAuthMode('login'); }
    });
    const onOnline = () => setConnection('online');
    const onOffline = () => setConnection('offline');
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { mounted = false; subscription.unsubscribe(); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); void cleanupChannels(); };
  }, [cleanupChannels, restore]);

  const leaveQueue = useCallback(async () => {
    setSearching(false);
    if (queueRef.current) { await queueRef.current.unsubscribe(); queueRef.current = null; }
    if (session) await supabase.rpc('leave_match_queue');
  }, [session]);

  const find = async () => {
    if (!session) return;
    if (searching) { await leaveQueue(); toast('Search cancelled.'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('find_match');
      if (error) throw error;
      if (data) await enterChat(data as Chat, session);
      else {
        setSearching(true);
        const channel = supabase.channel(`queue:${session.user.id}`);
        queueRef.current = channel;
        channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload) => {
          const nextChat = chatPayload(payload as RealtimePostgresInsertPayload<ChatInsert>);
          if (nextChat.user_a === session.user.id || nextChat.user_b === session.user.id) void enterChat(nextChat, session);
        });
        const status = await channel.subscribe();
        if (status !== 'ok') throw new Error('Realtime connection failed.');
        toast('Looking for someone…');
      }
    } catch (error) {
      setSearching(false);
      toast(error instanceof Error ? error.message : 'Could not start matchmaking.');
    } finally { setBusy(false); }
  };

  const endChat = async (rejoin = false) => {
    if (!chat || !session) return;
    const currentChat = chat;
    if (channelRef.current) { await channelRef.current.send({ type: 'broadcast', event: 'ended', payload: {} }); }
    await supabase.rpc('end_chat', { p_chat_id: currentChat.id });
    await cleanupChannels();
    setChat(null); setPeer(null); setMessages([]); setScreen('home');
    if (rejoin) window.setTimeout(() => void find(), 100);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chat || !session) return;
    const body = text.trim();
    if (!body) return;
    if (body.length > MAX_MESSAGE) { toast(`Messages are limited to ${MAX_MESSAGE} characters.`); return; }
    setText('');
    const { error } = await supabase.from('messages').insert({ chat_id: chat.id, sender_id: session.user.id, body });
    if (error) { setText(body); toast(error.message || 'Message could not be sent.'); }
  };

  const authenticate = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      if (authMode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast('If that email exists, a password reset link is on its way.');
        setAuthMode('login'); return;
      }
      if (authMode === 'reset') {
        if (password.length < 6) throw new Error('Use a password with at least 6 characters.');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast('Password updated.'); setPassword(''); setAuthMode('login'); return;
      }
      if (authMode === 'signup') {
        if (username.trim().length < 2) throw new Error('Choose a username with at least 2 characters.');
        const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() } } });
        if (error) throw error;
        toast('Account created. Check your email if verification is enabled.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) { toast(error instanceof Error ? error.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) toast(error.message);
  };

  const saveProfile = async () => {
    if (!profile) return;
    const name = profile.username.trim();
    if (name.length < 2 || name.length > 24) { toast('Username must be 2–24 characters.'); return; }
    const { error } = await supabase.from('profiles').update({ username: name }).eq('id', profile.id);
    if (error) toast(error.code === '23505' ? 'That username is already taken.' : error.message);
    else { setShowProfile(false); toast('Profile updated.'); }
  };

  const report = async () => {
    if (!peer || !session) return;
    const reportRow: Report['id'] extends number ? { reporter_id: string; reported_user_id: string; chat_id: string | null; reason: string } : never = { reporter_id: session.user.id, reported_user_id: peer.id, chat_id: chat?.id ?? null, reason };
    const { error } = await supabase.from('reports').insert(reportRow);
    if (error) toast('Could not submit report.'); else { setShowSafety(false); toast('Report submitted. Thank you.'); }
  };

  const block = async () => {
    if (!peer || !session) return;
    const { error } = await supabase.from('blocks').insert({ user_id: session.user.id, blocked_user_id: peer.id });
    if (error && error.code !== '23505') { toast('Could not block this user.'); return; }
    setShowSafety(false); toast('User blocked.'); await endChat(false);
  };

  useEffect(() => {
    const box = messageBoxRef.current;
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!supabaseConfigured) return <main className="center"><div className="panel"><h1>RandomChat</h1><p>Supabase is not configured.</p><code>VITE_SUPABASE_URL<br />VITE_SUPABASE_PUBLISHABLE_KEY</code></div></main>;

  return <main className="app">
    {notice && <div className="toast" role="status">{notice}</div>}
    {screen === 'auth' && <section className="auth page"><div className="brand"><span className="mark">RC</span> Random<span>Chat</span></div><div className="auth-card panel">
      <div className="eyebrow">MEET SOMEONE NEW</div>
      <h1>{authMode === 'forgot' ? 'Reset your password.' : authMode === 'reset' ? 'Choose a new password.' : <>One stranger.<br /><span>One conversation.</span></>}</h1>
      <p className="muted">{authMode === 'forgot' ? 'Enter your email and we’ll send a secure reset link.' : 'Start talking with someone you’ve never met, instantly.'}</p>
      {(authMode === 'login' || authMode === 'signup') && <div className="tabs"><button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Log in</button><button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Create account</button></div>}
      <form onSubmit={authenticate}>
        {(authMode !== 'reset') && <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" /></label>}
        {authMode !== 'forgot' && <label>{authMode === 'reset' ? 'New password' : 'Password'}<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={6} required autoComplete={authMode === 'signup' || authMode === 'reset' ? 'new-password' : 'current-password'} /></label>}
        {authMode === 'signup' && <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={24} required autoComplete="nickname" /></label>}
        <button className="primary wide" disabled={busy}>{busy ? 'Working…' : authMode === 'forgot' ? 'Send reset link' : authMode === 'reset' ? 'Update password' : authMode === 'signup' ? 'Create account' : 'Continue'}</button>
      </form>
      {authMode === 'login' && <><button className="secondary wide" onClick={google}>Continue with Google</button><button className="link-button" onClick={() => setAuthMode('forgot')}>Forgot password?</button></>}
      {(authMode === 'forgot' || authMode === 'reset') && <button className="link-button" onClick={() => setAuthMode('login')}>Back to login</button>}
      <small>Be respectful. Never share sensitive information with strangers.</small>
    </div></section>}
    {screen === 'home' && <section className="page"><header><div className="brand"><span className="mark">RC</span> Random<span>Chat</span></div><div className="actions"><button className="secondary" onClick={() => setShowProfile(true)}>Profile</button><button className="secondary" onClick={() => void supabase.auth.signOut()}>Log out</button></div></header>
      <div className="home-grid"><section className="hero panel"><div className="eyebrow">RANDOM MATCHMAKING</div><h2>Who will you<br /><span>meet today?</span></h2><p className="muted">No feeds. No follower counts. Just one real conversation at a time.</p><button className="primary hero-button" disabled={busy} onClick={() => void find()}>{searching ? 'Cancel search' : 'Find someone'} <b>↗</b></button><div className="safety"><span>✓ Report & block</span><span>✓ Private conversations</span></div></section><aside className="panel how"><h3>How it works</h3><div><b>01</b><p><strong>Find someone</strong><br />Join the live matchmaking queue.</p></div><div><b>02</b><p><strong>Get paired</strong><br />A private room is created for two.</p></div><div><b>03</b><p><strong>Talk freely</strong><br />Skip anytime. You’re always in control.</p></div></aside></div>
      </section>}
    {screen === 'chat' && chat && peer && session && <section className="chat"><header><div className="person"><div className="avatar">{initials(peer.username)}</div><div><strong>{peer.username}</strong><small><i className={connection === 'offline' ? 'offline' : ''} /> {connection === 'online' ? 'connected' : 'reconnecting…'}</small></div></div><div className="actions"><button className="secondary" onClick={() => setShowSafety(true)}>Safety</button><button className="secondary" onClick={() => void endChat(true)}>Next</button></div></header>
      <div className="messages" ref={messageBoxRef}>{messages.length === 0 && <div className="empty"><div className="avatar big">{initials(peer.username)}</div><h3>Say hello to {peer.username}.</h3><p className="muted">This is a private conversation between the two of you.</p></div>}{messages.map((message) => <div className={`message ${message.sender_id === session.user.id ? 'mine' : ''}`} key={message.id}><div className="bubble">{message.body}</div><time>{formatTime(message.created_at)}</time></div>)}<div ref={bottomRef} /></div>
      <form className="composer" onSubmit={send}><input value={text} onChange={(event) => setText(event.target.value)} maxLength={MAX_MESSAGE} placeholder="Say hello…" autoComplete="off" /><button className="primary" disabled={!text.trim() || connection === 'offline'}>Send</button></form>
      {showSafety && <div className="overlay"><div className="panel modal"><button className="close" onClick={() => setShowSafety(false)}>×</button><h3>Safety</h3><p className="muted">Help keep RandomChat welcoming.</p><label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}><option>Harassment or bullying</option><option>Spam or scam</option><option>Inappropriate content</option><option>Threatening behaviour</option><option>Other</option></select></label><div className="modal-actions"><button className="secondary" onClick={() => void report()}>Report</button><button className="danger" onClick={() => void block()}>Block & leave</button></div></div></div>}
    </section>}
    {showProfile && profile && <div className="overlay"><div className="panel modal"><button className="close" onClick={() => setShowProfile(false)}>×</button><h3>Your profile</h3><p className="muted">This is the name strangers see.</p><label>Username<input value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} maxLength={24} /></label><div className="modal-actions"><button className="secondary" onClick={() => setShowProfile(false)}>Cancel</button><button className="primary" onClick={() => void saveProfile()}>Save</button></div></div></div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
