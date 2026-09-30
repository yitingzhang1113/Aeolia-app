# Aeolia Game Room — Implementation Plan

> **Status:** planning (no game code written yet).
> **Transport decision:** FastAPI WebSocket + Redis (live state) + PostgreSQL (history).
> **Guiding principle:** Game Room is a *Social-layer* feature, not a game center. Its only
> job: after two people (or a group) Connect, give them a natural reason to interact.
> *Play together, talk naturally.*

## 0. Where it sits in the product

```
Discover → Elf ↔ Elf → Human Connect → Mutual Connect → Chat → (+ → 🎮 Play) → Game Room
```

Only **already-connected** members can enter a room. V1 has **no** stranger matchmaking,
leaderboards, coins, shop, or ranks. The chat bar is **always present inside the room** —
the game is the icebreaker, the conversation is the point.

## 1. Phased roadmap

| Phase | Ships | Needs realtime? |
|---|---|---|
| **P1** | Invite→Join flow + Game Room shell (players, card-count header, game-area placeholder, persistent in-room chat). Room lifecycle (create on Join). | No — REST only |
| **P2** | **Draw & Guess (2P)** — the first real game. Normalized stroke sync, round/role loop, guess-via-chat. | Yes — WS + Redis |
| **P3** | **UNO (2P)** — authoritative UNO engine, wild color picker, UNO call, reconnect, push. | Yes |
| **V1.5** | Group Draw & Guess, Group UNO (2–6). Same engines, N players. | Yes |
| **V2** | Werewolf + Elf host (engine = ground truth, LLM = narration only), AI icebreakers, AI NPC when a group is short. | Yes |

Each phase is independently shippable. We build **P1 first** (no realtime), then stand up the
WS+Redis infra for P2.

## 2. Architecture

```
React Native + Expo
   │  REST (lifecycle, history, invites)
   │  WebSocket (live game + chat + draw + presence)
   ▼
FastAPI
   │
 Game Service ── Game Engines (UNO / DrawGuess / Werewolf) — authoritative, UI-independent
   │
 ┌─┴───────────────┐
 ▼                 ▼
Redis            PostgreSQL
(live state)     (durable history)
```

- **REST**: create/list rooms, fetch snapshot, post invite, join, end.
- **WebSocket**: one connection per member per room; carries `game.action`, `game.state`,
  `chat.message`, `draw.stroke`, `presence`.
- **Game Engines**: pure functions over state. **Never trust the client** for legality — the
  server validates every action and is the single source of truth.

### Redis (live, ephemeral, TTL'd)
- `room:{id}:state` — serialized authoritative game state (+ monotonic `version`).
- `room:{id}:players` — membership, per-player private view keys.
- `room:{id}:presence` — connected/disconnected + last-seen.
- `room:{id}:timer` — turn/round deadline.
- `room:{id}:strokes` — Draw & Guess stroke log for the current round (for reconnect replay).
- Pub/Sub channel `room:{id}` fans WS broadcasts across app processes.
- TTL on all keys; refreshed on activity; room GC'd after the reconnect window closes.

### PostgreSQL (durable)
- `game_rooms(id, kind, connection_id/scope, host_id, status, started_at, ended_at, winner_id)`
- `game_participants(room_id, user_id, joined_at, left_at, result)`
- `game_events(room_id, seq, type, payload, at)` — optional, for replay/history/stats.
- Live per-move state stays in Redis; only outcomes/summaries are persisted.

## 3. Realtime protocol (single envelope for all games)

Client → server:
```json
{ "type": "game.action", "room_id": "room_123", "game": "uno",
  "action": { "type": "play_card", "card_id": "red_7" } }
```
Server → clients (authoritative, versioned):
```json
{ "type": "game.state", "version": 27, "state": { /* per-recipient view */ } }
```
Also: `chat.message` (`{ "body": "😂" }`), `draw.stroke` (see §5), `presence`
(`{ "user_id": 123, "status": "connected" }`).

**Versioning + reconnect:** every state broadcast carries an incrementing `version`. On
reconnect (backgrounded / locked / network flip / crash), the client sends its last seen
`version`; if it lags the server, the server replies with a full snapshot. Room stays alive
for a **30–60s reconnect window** so a dropped player doesn't lose their hand.

## 4. Invite → Join → Room lifecycle (P1, no realtime)

1. Chat `+` grid → **🎮 Play** tile → **"Play together"** bottom sheet
   (🎨 Draw & Guess, 🃏 UNO, ❓ Questions *(later)*).
2. Pick a game → **"Invite Emma to UNO?"** confirm dialog → **Invite**.
3. A **structured invite message** appears in the chat (new message kind `game_invite`,
   carrying `{ game, room_id }`), rendered as a card with a **[Join Game]** button.
   - Extends the existing message-media work (`messages.media_id`, kinds text/image/voice/
     file/game/meetup). Add kind `game_invite` + a nullable `game_room_id` column, or encode
     the room ref in `body` as JSON for the prototype.
4. **Only when the invitee taps [Join Game]** is an *active* room created (REST
   `POST /games/rooms`), and both clients navigate into the Game Room.
5. Deep link `aeolia://game/{room_id}` (push tap) opens straight into the room.

Room shell UI (P1 renders this even before engines exist):
```
‹  UNO                ···
Yiting            Emma
 ◉                 ◉
 5 cards          3 cards
        GAME AREA (placeholder in P1)
──────────────────────────────
🎙 [ Say something... ]  ☺  ＋
```

## 5. Game engines

### UNO (`backend/app/games/uno/`)
- Cards: 0–9, Skip, Reverse, +2, Wild, Wild+4. (2P Reverse ≡ Skip.)
- State (server-authoritative): `currentPlayerId, topCard, currentColor, direction,
  drawPileCount, players[], status`.
- **Per-recipient view**: a client receives `opponentCardCount: 3` — **never**
  `opponentHand`. Own hand only.
- Flow: `tap card → lift anim → POST/WS play_card → server validates → broadcast → card to
  center`. Illegal card → `shake` + "Can't play this card." Legality decided **server-side**.
- Wild → color picker → `currentColor = chosen`.
- UNO call: at 2→1 cards, a 2–3s "TAP UNO"; miss → draw 2 (challenge system optional in MVP).
- Ending: "You won!" + social CTA (`Play Again` / `Ask Emma something`). **No coins/ranks.**

### Draw & Guess (`backend/app/games/draw_guess/`) — ship before UNO
- Round: server picks word, **only the Drawer** receives it; 60s; guesser types in chat.
- **Stroke sync (not PNGs):**
  ```json
  { "type": "draw.stroke", "points": [[0.31,0.44],[0.32,0.45]], "width": 4 }
  ```
  Coordinates are **0–1 normalized** so every screen size renders the same position.
  Render with Skia paths on both sides.
- **Guess = chat:** guesser's chat messages are the game input. Wrong → normal chat line.
  Correct → `✨ Emma guessed CAT! +100`, then swap roles. 6 rounds → end.
- Hints: reveal letters over time (`C _ _`).

### Werewolf (`backend/app/games/werewolf/`) — V2
- Roles, night/day loop, vote, elimination — **all resolved by the engine (ground truth)**.
- **Elf hosts the narration only.** `result = engine.resolve_night()` → `{eliminated, protected}`
  → Elf phrases it atmospherically. **Never** ask the LLM who should die.

## 6. File structure

```
backend/app/games/
├── router.py        # REST: rooms, invites, join, snapshot, history
├── websocket.py     # WS endpoint, auth, envelope routing, pub/sub fanout
├── rooms.py         # lifecycle, Redis room state, versioning, reconnect
├── presence.py      # connect/disconnect, reconnect window
├── uno/ (cards, deck, rules, state, engine)
├── draw_guess/ (words, state, engine)
└── werewolf/ (roles, state, engine, host)

mobile/src/games/
├── common/  (GameHeader, PlayerAvatar, GameChat, InviteCard)
├── uno/     (UnoGame, UnoCard, Hand, DrawPile, ColorPicker)
├── drawGuess/ (DrawGame, Canvas, GuessInput)
└── werewolf/ ...
# room screen: mobile GameRoom screen keyed by roomId, chat bar always mounted.
```

## 7. Authorization & safety

- Join allowed **only between mutually-connected** members (reuse `mutual()`); group rooms
  scoped to a shared group/circle.
- Server validates **every** action; clients never decide legality or see hidden state.
- WS auth: same actor identity as REST (replace the dev `X-User-Id` header with real auth
  before this ships to users).
- Rate-limit chat/strokes; cap stroke frequency; validate normalized coords in [0,1].

## 8. Push & reconnect

- Invite / your-turn → APNs; tap → `aeolia://game/{room_id}`.
- Reconnect window 30–60s; client resyncs by `version` → snapshot. UNO hands survive drops.

## 9. Elf's relationship to games (V1 boundary)

Elf does **not** play in V1. It may only *recommend* a game / suggest an icebreaker
("Your Elf thinks you both like casual games. Invite Emma to Draw & Guess?") — the **human
still taps Invite**, consistent with Aeolia's Connect philosophy. Elf-as-host arrives with
Werewolf (V2), narration-only.

## 10. P1 task breakdown (the next build — no realtime needed)

**Backend (REST + Postgres):**
1. `game_rooms` + `game_participants` tables + migration (additive, like `add_message_media`).
2. `POST /games/rooms` (create on Join), `GET /games/rooms/{id}` (shell snapshot),
   `POST /games/rooms/{id}/end`.
3. New message kind `game_invite` carrying `{game, room_id?}`; validation + GET serialization.
4. Tests: invite→join creates a room; only invitee can join; non-mutual rejected.

**Frontend:**
5. `+` grid: **🎮 Play** tile → **"Play together"** sheet (Draw & Guess / UNO / Questions*later*).
6. Invite confirm dialog → send `game_invite` message.
7. `InviteCard` bubble with **[Join Game]** (host sees "waiting", invitee sees Join).
8. `GameRoom` screen (new page): header (players + card-count placeholders), **game-area
   placeholder**, persistent chat bar (reuse the WeChat-style composer).
9. Navigation + `aeolia://game/{id}` deep link stub.

**Deferred to P2 (needs WS+Redis):** the actual Draw & Guess gameplay, stroke sync, timers,
presence, reconnect.

## 11. Open decisions

- **`+` grid contents.** Spec §2 shows `Album / Camera / Voice / Video · Location / Play /
  Event / Activity`. Current build has `Album / Camera / File / Game room / Meetup plan`.
  Decide the final 8-slot grid (where do File / Voice-message / Video-call / Location / Event /
  Activity live?) before P1 UI lands.
- **Invite room ref:** dedicated `game_room_id` column vs. JSON-in-`body` for the prototype.
- **Redis deployment:** local Docker Redis for dev (add to `docker-compose.yml`); managed
  Redis for prod.
- **WS auth:** requires real auth (the dev `X-User-Id` header is not authentication).
```
