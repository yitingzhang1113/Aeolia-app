# Aeolia

An early, runnable iOS/Android social app prototype based on the Aeolia product concept. People join public Circles, publish text posts, follow one another, and ask customizable agents to explore a Neo4j social graph. Agent encounters show the path, public post evidence, and an inspectable agent-to-agent transcript. The phone app uses a warm cream and sea-glass teal visual system.

## What works now

- Expo mobile screens: Home, Feed, Circles, Explore graph, create post and event, agent preferences, profiles and outfit colors, chats, encounter evidence/transcript, Events, Settings and Plus placeholder.
- FastAPI JSON endpoints with PostgreSQL (SQLite fallback for local tests), Neo4j graph projection, seeded demo users and Circles.
- Separate **Follow circle** and **Allow agent exploration** switches. Public Circle posts and friends-only posts have different read permissions.
- Bounded, randomized Neo4j Circle candidate traversal. A no-post user can still be found through explicitly shared interests and Circle membership. Post evidence is read from Postgres after permission checks.
- Agent-to-agent conversation only if **both** accounts opt in. The current transcript is deterministic demo text, not an AI model call.

## Run locally

Prerequisites: Python 3.11+, Node 20+, Docker, and Expo's iOS Simulator or Android emulator.

```bash
docker compose up -d
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=postgresql+psycopg://aeolia:aeolia_dev@localhost:5432/aeolia uvicorn app.main:app --reload
```

In a second terminal:

```bash
cd mobile
npm install
npm start
```

API docs: `http://localhost:8000/docs`. Neo4j Browser: `http://localhost:7474` (neo4j / aeolia_dev_password). If you test on a physical phone, set `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8000` before starting Expo. The demo switches account through `X-User-Id: 1` (Yiting), `2` (Kai), `3` (Maya), `4` (Leo); only use this on your own development machine.

```bash
cd backend
pytest -q
```

## Architecture

| Layer | Responsibility |
| --- | --- |
| Expo / React Native | Phone UI and navigation |
| FastAPI | Business endpoints and permission checks |
| PostgreSQL | Accounts, visibility, posts, follows, messages, events, encounters and transcript source of truth |
| Neo4j | Circle, person and shareable interest relationships for bounded random exploration |

`Person`, `Circle` and `Topic` are Neo4j nodes. `IN_CIRCLE` and `LIKES` are edges. Preference notes given privately to an agent remain in Postgres and are **not** copied verbatim into Neo4j. The graph only contains explicitly shareable interest tags. Profile and post permissions are always rechecked in Postgres before the app receives a recommendation.

## Next milestones before external users

This is a product prototype, **not a production social service**. Replace the demo `X-User-Id` header with verified login; tighten CORS; add passwordless/email or OAuth authentication, moderation, block/report flows, proper media uploads and video transcoding, end-to-end permission revocation, migration tooling, background graph synchronization and retry. Add a model worker for Agent-owner dialogue and consented Agent-to-Agent conversations, Jev for bounded structured candidate scoring, real subscription entitlements, WebSocket-powered games/chat, LiveKit calls, push notifications and hosted object storage. The screens currently indicate these integrations as placeholders; they never charge money or claim a real AI conversation occurred.

The graph traversal is deliberately stochastic. Jev should later influence candidate selection but must not turn it into a fixed compatibility ranking. Sponsored Circle posts are planned as clearly labelled feed items, excluded from person recommendations.
