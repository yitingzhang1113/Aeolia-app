<div align="center">
  <img src="mobile/assets/logo.png" alt="Aeolia planet logo" width="144" />
  <h1>Aeolia</h1>
  <p><strong>Meet real people through unexpected, explainable connections.</strong></p>
  <p>Circles · Agent avatars · Graph discovery · Human connections</p>
</div>

---

**An agent-assisted social app for meeting real people through circles and unexpected encounters.**

Aeolia combines a real profile with a customizable agent avatar. Members follow public circles, publish posts, and choose where their agent may explore. The agent suggests people through a social graph and presents an explanation, eligible public post evidence, and an inspectable conversation when both people permit agent chat. The people decide whether to follow, message, or join an event.

> **Status: development prototype.** The app and API run locally with seeded accounts. Live agent replies require a configured compatible model provider or a temporary user-provided key. Billing, production authentication, real-time media, and production-grade AI safety are not implemented. This repository is not ready for public users.

## Product principles

- **User control:** Following a circle and allowing agent exploration are separate choices. Agent-to-agent chat requires permission from both accounts.
- **Discovery with chance:** Bounded randomized graph traversal provides variety while shared circles and interests explain each introduction.
- **Participation without posting:** A person can be found through circle membership and explicitly shared interests.
- **Inspectable recommendations:** Encounter records include a graph path, rationale, eligible public posts, and agent turns.
- **Separate identity layers:** The avatar represents the agent; profile photos and personal details represent the person.

## Implementation status

| Area | Available in this prototype | Planned |
| --- | --- | --- |
| Mobile | Expo screens for Home, Feed, Explore, agent, chats, events, profile, create, settings | Accessibility and polished navigation |
| Profiles | Seeded people and basic avatar outfit color | Profile editing, photo storage, animated avatars |
| Circles and posts | Follow/explore switches; public circle and friends-only text posts | Pagination, moderation, media upload |
| Discovery | Neo4j relationships and bounded randomized candidate traversal | Background sync and load testing |
| Agent chat | Real compatible-model calls, mutual consent check, readable transcript | Moderation, queue, revocation, cost controls |
| Messages/events | Persisted basic text messages and event records | Groups, games, invitations, calls |
| Subscription | UI placeholder | Billing and server-side entitlements |

## Repository

```text
Aeolia-app/
├── backend/
│   ├── app/
│   │   ├── main.py       # API, permissions, discovery
│   │   ├── ai.py         # Compatible model provider adapter
│   │   ├── models.py     # Relational data model
│   │   └── graph.py      # Neo4j projection and traversal
│   ├── tests/
│   └── requirements.txt
├── mobile/
│   ├── App.tsx            # Expo screens
│   ├── assets/            # Planet logo and app icon
│   └── src/               # API client, theme, components
├── docker-compose.yml    # Development databases
└── README.md
```

## Architecture

```mermaid
flowchart TB
    Mobile["Expo mobile app"] --> API["FastAPI"]
    API --> SQL["PostgreSQL: source of truth"]
    API --> Graph["Neo4j: discovery projection"]
    SQL --> Graph
```

PostgreSQL holds accounts, visibility choices, posts, follows, messages, events, encounters, and agent turns. Neo4j projects people, circles, shareable topics, and their relationships for exploration. Private agent preference notes stay in the relational database and are not copied verbatim into Neo4j. The API rechecks blocks, discoverability, and public post visibility against the source of truth before showing recommendations. A durable synchronization mechanism and reconciliation job are required before production.

### AI connection and MCP

The backend calls an operator-configured **OpenAI-compatible Chat Completions API**. Set `AEOLIA_AI_API_KEY` for a shared development configuration, or enter a personal provider key in the app's Settings for the current session. Personal keys are passed with agent requests and are not stored in the database or written to the repository. Both agent replies and consented agent introductions use this adapter. Without a key, they return a clear service error; the app does not silently fabricate a transcript.

**MCP is for connecting an agent to tools and data sources, not a universal way to connect an arbitrary model account.** A future Aeolia MCP server could expose scoped tools such as `search_circle`, `read_public_post`, and `request_introduction`. The app would still need a model provider and an authenticated MCP client; tools must enforce the user's consent and visibility on every call. Do not connect arbitrary user-supplied MCP URLs to this backend: remote tools need explicit approval, OAuth and network isolation.

```mermaid
flowchart LR
    Member["Member & avatar"] --> API["Aeolia API"]
    API --> Model["Compatible AI provider"]
    API --> Graph["Neo4j discovery"]
    API --> Data["PostgreSQL permissions"]
    Model -. "future tool calls" .-> MCP["Scoped MCP server"]
    MCP --> API
```

## Local development

### Prerequisites

- Python 3.11 or later
- Node.js 20 or later and npm
- Docker with Compose
- iOS Simulator, Android emulator, or Expo Go on a development device

From the repository root, start PostgreSQL and Neo4j:

```bash
docker compose up -d
```

In another terminal, start the API:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=postgresql+psycopg://aeolia:aeolia_dev@localhost:5432/aeolia \
  uvicorn app.main:app --reload
```

In a third terminal, start the mobile app:

```bash
cd mobile
npm install
npm start
```

API documentation: <http://localhost:8000/docs>. Neo4j Browser: <http://localhost:7474> (username `neo4j`, password `aeolia_dev_password`). A new database is seeded with four demo accounts and two circles.

On a physical phone, set `EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:8000` before starting Expo. The default `localhost` requires a simulator that can reach the host. The development-only `X-User-Id` header selects demo accounts `1` through `4`; **it is not authentication**.

### Environment variables

| Variable | Component | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | API | `sqlite:///./aeolia.db` | Relational database; use PostgreSQL for the full stack |
| `NEO4J_URI` | API | `bolt://localhost:7687` | Graph connection |
| `NEO4J_USER` | API | `neo4j` | Graph username |
| `NEO4J_PASSWORD` | API | `aeolia_dev_password` | Local graph password |
| `EXPO_PUBLIC_API_URL` | Mobile | `http://localhost:8000` | API address reachable from the device |
| `AEOLIA_AI_API_KEY` | API | unset | Server-side provider key; needed unless a temporary personal key is sent |
| `AEOLIA_AI_BASE_URL` | API | `https://api.openai.com/v1` | Operator-configured HTTPS compatible provider endpoint |
| `AEOLIA_AI_MODEL` | API | `gpt-4.1-mini` | Provider model identifier |
| `AEOLIA_ALLOW_LOCAL_AI` | API | unset | Set to `1` only to permit `http://localhost:...` for local model testing |

Compose credentials are for local development only.

Example for the official OpenAI endpoint:

```bash
export AEOLIA_AI_API_KEY="your-development-api-key"
export AEOLIA_AI_MODEL="gpt-4.1-mini"
# Restart uvicorn after changing server environment variables.
```

To use another compatible provider, set `AEOLIA_AI_BASE_URL` and `AEOLIA_AI_MODEL` on the **server**. Personal keys in the prototype's Settings are held in app memory and cleared when the app restarts; they do not change the provider URL. Do not share provider keys with other users. Public release needs authenticated accounts, encryption, provider allowlists, key custody rules, spend limits, logging redaction, and moderated background jobs.

## API overview

| Resource | Routes | Purpose |
| --- | --- | --- |
| Health/account | `GET /health`, `GET/PATCH /me` | Availability and demo preferences |
| People | `GET /users/{id}`, `GET /users/by-id/{handle}`, `POST /users/{id}/follow` | Profiles, ID lookup, following |
| Circles | `GET /circles`, `PATCH /circles/{id}` | Circle follow and explore choices |
| Posts | `GET /feed`, `GET /circles/{id}/posts`, `POST /posts`, `DELETE /posts/{id}` | Feed and text posts |
| Discovery | `POST /explore/{circle_id}`, `GET /encounters`, `GET /encounters/{id}`, `POST /encounters/{id}/agent-chat` | Search, evidence, model-backed dialogue |
| AI | `GET /agent/status`, `POST /agent/reply` | Configuration state and a model-backed private agent reply |
| Messages/events | `GET /messages/{other_id}`, `POST /messages`, `GET/POST /events` | Basic chat and activities |

See OpenAPI documentation for request schemas. Media URL and message kind fields do not imply an upload pipeline or voice/video delivery.

## Verification

```bash
cd backend
python -m pytest -q tests

cd ../mobile
npm run typecheck
```

API tests use temporary SQLite. The Neo4j path needs a running local stack; automated graph integration and mobile interaction tests remain future work.

## Production requirements

Before inviting external users, implement verified authentication, authorization, consent and privacy controls, blocking/reporting, moderation, deletion, schema migrations, secret management, background graph synchronization, observability, and abuse protection. Media processing, real-time communication, games, and paid entitlements require separate implementation and testing. Agent conversations need a moderated model worker, rate limits, key custody and cost controls, and clear disclosure of accessible information.

Sponsored circle posts and Jev-based candidate scoring are product proposals, not shipped features. Future ads should be clearly labeled and excluded from person recommendations unless people explicitly consent.

## Contributing and license

This is an early private product prototype. Open an issue before substantial architectural changes. No open-source license has been granted; contact the repository owner for reuse permission.
