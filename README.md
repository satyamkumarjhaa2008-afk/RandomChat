# RandomChat

A polished 1-to-1 random conversation MVP built as a dependency-light static web app with Supabase and WebRTC.

## Included MVP

- Email/password authentication
- Google OAuth button (requires Google provider setup in Supabase)
- Automatic user profiles and editable display names
- Live random matchmaking queue
- Real-time 1-to-1 messaging
- Typing indicators and online presence
- Next-chat and end-chat controls
- Voice calls with WebRTC
- Video calls with WebRTC
- Mic/camera controls and call timer
- P2P file transfer over WebRTC DataChannel (25 MB limit)
- Report and block controls
- Block-aware matchmaking
- Row-level security for user data and safety tables
- Supabase Realtime signaling and chat events
- Responsive glassmorphism UI, GSAP motion, and Lucide icons

## Run locally

This app is intentionally dependency-light. Serve it over HTTP(S); do not open `index.html` directly because browser module imports require an origin.

```bash
python -m http.server 5173
```

Open <http://localhost:5173>.

## Supabase setup

The frontend uses the RandomChat Supabase project and the browser-safe publishable key in `src/config.js`. Never put a service-role or secret key in client code.

The repository contains the SQL migrations used for the MVP:

- `20260915153204_randomchat_mvp_security_and_signaling.sql`
- `20260915190000_safety_reports_and_blocking.sql`

Google sign-in must be enabled in **Supabase Dashboard → Authentication → Providers → Google**, with your local/deployed URL configured as an allowed redirect URL.

## Production WebRTC

STUN is configured for development. Production deployments should add a TURN server to `src/config.js` so calls can connect across restrictive NATs/firewalls. Use credentials issued by your TURN provider; never hard-code a long-lived provider secret.

## Security notes

- Browser code only uses the Supabase publishable key.
- Exposed tables have RLS policies.
- Matchmaking runs through an authenticated RPC and excludes users blocked in either direction.
- Reports and blocks are scoped to the authenticated user.
- File transfer is peer-to-peer; files are not persisted by RandomChat.

## Validation

```bash
npm run check
```

The check validates the JavaScript syntax.
