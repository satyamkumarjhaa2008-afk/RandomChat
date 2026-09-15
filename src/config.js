// src/config.js
export const SUPABASE_URL = 'https://kgefbqwglvvqnrdapyfd.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AQCjSptMiWObYawfmjZG2Q_S4N-pjx2';

// WebRTC: STUN helps peers discover their public candidates. A TURN server is
// strongly recommended for production because some networks block direct P2P.
export const RTC_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const FILE_CHUNK_BYTES = 16 * 1024;
export const APP_NAME = 'RandomChat';
