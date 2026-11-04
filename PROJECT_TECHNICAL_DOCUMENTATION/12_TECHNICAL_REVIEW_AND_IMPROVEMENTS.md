# Document 12: Technical Review, Debt & Architecture Improvement Roadmap

This document provides a senior-architect-level technical evaluation of the HackPair platform, identifying architectural bottlenecks, technical debt, and prioritized improvements.

---

## 1. Prioritized Architectural Recommendations

| Issue / Opportunity | Area | Impact | Priority | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **Image Storage Strategy** | Backend / DB | High | 🔴 **High** | Migrate profile avatars from base64/URL strings to **AWS S3 / Cloudflare R2** with signed upload URLs. |
| **Message Cursor Pagination** | Backend / Chat | Medium-High | 🔴 **High** | Implement cursor-based pagination (`limit: 50, before: timestamp`) to prevent unbounded array size growth. |
| **Durable Email Message Queue** | Backend / Async | Medium | 🟠 **Medium** | Introduce **BullMQ + Redis** to guarantee message delivery during sudden server restarts. |
| **Socket.IO Multi-Instance Scaling** | Backend / Realtime | High (at scale) | 🟠 **Medium** | Add `@socket.io/redis-adapter` to sync WebSocket events across multiple load-balanced containers. |
| **Feed Query Pipeline Refactoring** | Backend / DB | Medium | 🟠 **Medium** | Refactor `$nin` query to a MongoDB `$lookup` aggregation pipeline as user interaction counts grow. |
| **Refresh Token Rotation** | Security | Medium | 🟡 **Low-Med** | Split the 7-day token into a 15-minute access token and a 7-day rotating refresh token. |
| **Automated Testing Suite** | DevOps / QA | High | 🟡 **Medium** | Implement Jest / Supertest integration tests for backend APIs and Playwright E2E for frontend swipe flows. |

---

## 2. In-Depth Technical Review of Key Areas

### Issue 1: Profile Image Storage Architecture
- **Current Implementation**: Avatars are stored as external URL strings or base64 data URIs directly inside the MongoDB `User.photoUrl` field.
- **Why It Is Problematic**:
  1. Base64 strings increase document size by ~33%, consuming significant MongoDB Atlas RAM and causing slower query response times during feed queries.
  2. External image links can fail or result in broken images (handled by frontend fallback, but suboptimal UX).
- **Recommended Solution**:
  1. Create a presigned URL endpoint: `POST /api/upload/presigned-url`.
  2. Upload image binaries directly from the browser to an **AWS S3** bucket or **Cloudflare R2** (zero egress fees).
  3. Store only the clean CDN URL (e.g., `https://cdn.hackpair.dev/avatars/<userId>.webp`) in MongoDB.
- **Priority**: 🔴 **High**

---

### Issue 2: Chat Message Pagination
- **Current Implementation**: In [`src/routes/chat.js`](file:///c:/Backend/hackpair-backend/src/routes/chat.js), `GET /chat/:targetUserId` returns the entire `chat.messages` array embedded within the conversation document.
- **Why It Is Problematic**:
  If two developers exchange 10,000 messages over months, the document approaches MongoDB's 16MB BSON limit, and fetching `/chat/:id` serializes megabytes of JSON over the network.
- **Recommended Solution**:
  1. Migrate messages to a dedicated `messages` collection: `{ chatId, senderId, text, seen, createdAt }`.
  2. Query messages using cursor-based pagination:
     ```javascript
     const messages = await Message.find({ chatId, createdAt: { $lt: cursorDate } })
         .sort({ createdAt: -1 })
         .limit(50);
     ```
  3. Reverse the array in the response to display in chronological order, loading older messages as the user scrolls up.
- **Priority**: 🔴 **High**

---

### Issue 3: Asynchronous Email Delivery Durability
- **Current Implementation**: Emails in [`src/routes/requests.js`](file:///c:/Backend/hackpair-backend/src/routes/requests.js) and [`src/routes/auth.js`](file:///c:/Backend/hackpair-backend/src/routes/auth.js) are dispatched in a fire-and-forget asynchronous pattern (`sendConnectionRequestEmail(...).catch(...)`).
- **Why It Is Problematic**:
  If the hosting instance crashes, restarts during a deployment, or experiences an out-of-memory event while the SMTP connection is executing, the email is lost without a retry.
- **Recommended Solution**:
  Use **BullMQ** backed by Redis:
  ```javascript
  await emailQueue.add("sendConnectionRequest", { recipientId, senderId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 }
  });
  ```
  A dedicated background worker processes the queue with automated retries and dead-letter queue logging.
- **Priority**: 🟠 **Medium**

---

### Issue 4: Real-Time Multi-Server Scaling (Socket.IO Redis Adapter)
- **Current Implementation**: Socket.IO maintains connection state and rooms exclusively in the Node.js server process memory.
- **Why It Is Problematic**:
  In a single-instance deployment, this works flawlessly. However, if the platform scales to 2 or more backend instances behind an Application Load Balancer, User A connected to Server 1 cannot exchange socket events with User B connected to Server 2.
- **Recommended Solution**:
  Install `@socket.io/redis-adapter`:
  ```javascript
  const { createAdapter } = require("@socket.io/redis-adapter");
  const { createClient } = require("redis");

  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  ```
  Redis Pub/Sub synchronizes room broadcasts across all server nodes automatically.
- **Priority**: 🟠 **Medium**

---

### Issue 5: Refresh Token Rotation Architecture
- **Current Implementation**: Authenticated sessions rely on a single signed JWT token with a 7-day lifespan stored in an `HttpOnly` cookie.
- **Why It Is Problematic**:
  If an access token is compromised, it remains valid for 7 days unless a centralized token revocation blacklist is queried on every request.
- **Recommended Solution**:
  Implement dual-token rotation:
  1. **Access Token**: Short-lived (15 minutes), signed JWT, verified statelessly in memory.
  2. **Refresh Token**: Long-lived (7 days), stored in an `HttpOnly` cookie with a path restricted to `/api/auth/refresh`. When refreshed, the server issues a new access token and rotates the refresh token in the database, invalidating stolen tokens.
- **Priority**: 🟡 **Low-Medium**

---

## 3. Architecture Maturity Scorecard

| Area | Current Rating | Strengths | Next Milestone |
| :--- | :--- | :--- | :--- |
| **API Design** | **9 / 10** | RESTful semantics, whitelisted updates, standard status codes (401, 403, 404). | OpenAPI / Swagger specification documentation. |
| **Security** | **9 / 10** | HttpOnly cookies, Helmet headers, rate limiting, IDOR checks, bcrypt hashing, SHA-256 tokens. | Refresh token rotation. |
| **Real-Time Messaging** | **8.5 / 10** | Low latency, deterministic room generation, unread counters, typing indicators. | Redis Pub/Sub adapter for multi-instance scaling. |
| **Database Design** | **8.5 / 10** | Compound indexing, pre-save integrity hooks, automatic serialization transforms. | S3 asset offloading and cursor message pagination. |
| **Frontend Architecture** | **9 / 10** | Next.js 16 App Router, CSS Modules, custom data hooks, responsive mobile views. | End-to-end integration tests (Playwright). |
| **Reliability & DevOps**| **8 / 10** | Google DNS overrides, health check endpoints, environment variable sandboxing. | Docker containerization & GitHub Actions CI/CD. |

