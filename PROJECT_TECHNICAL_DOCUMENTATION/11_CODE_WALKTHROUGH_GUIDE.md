# Document 11: Code Walkthrough Guide & Deep Dive (Top 8 Files)

This guide breaks down the 8 most technically critical files across both codebases that you must understand thoroughly before a technical interview.

---

## 1. `src/utils/socket.js` (Backend WebSocket Engine)

- **File Path**: [`src/utils/socket.js`](file:///c:/Backend/hackpair-backend/src/utils/socket.js)
- **Primary Responsibility**: Manages real-time bi-directional messaging, connection authorization, deterministic room creation, and user notification broadcasts.

### Key Logic & Algorithms

#### A. Handshake Cookie Authentication
```javascript
io.use(async (socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = socket.handshake.auth?.token || cookies.token;
    if (!token) return next(new Error("Authentication error: Token missing"));

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded._id).select("_id firstName lastName photoUrl");
    if (!user) return next(new Error("Authentication error: User not found"));

    socket.user = user;
    next();
});
```
- **Why it matters:** Unlike naive WebSocket setups where any client can connect anonymously, every WebSocket client is authenticated using their HTTP cookie **before** the socket connection is accepted.

#### B. Deterministic Room Routing
```javascript
const getRoomId = (userA, userB) => {
    return [userA.toString(), userB.toString()].sort().join("_");
};
```
- **Why it matters:** Guarantees that whether User A messages User B or User B messages User A, the exact same private room identifier is generated without storing an extra room table in the database.

#### C. Personal Notification Room Architecture
```javascript
io.on("connection", (socket) => {
    socket.join(socket.user._id.toString());
    // ...
    socket.on("sendMessage", async ({ targetUserId, text }) => {
        // Broadcast to chat room
        io.to(roomId).emit("messageReceived", messagePayload);
        // Broadcast to recipient personal room for instant sidebar unread badge update
        io.to(targetUserId.toString()).emit("newUnreadMessage", { ... });
    });
});
```
- **Interviewer Question:** *"How does your app update the recipient's unread badge if they aren't currently inside the chat room?"*
- **Your Answer:** *"Every connected user joins their own personal room keyed by their user ID (`socket.join(userId)`). When a message is sent, the server broadcasts the message to the active chat room and concurrently emits `newUnreadMessage` to the recipient's personal room, triggering their sidebar badge to increment in real time."*

---

## 2. `src/routes/user.js` (The Feed Exclusion Query)

- **File Path**: [`src/routes/user.js`](file:///c:/Backend/hackpair-backend/src/routes/user.js)
- **Primary Responsibility**: Generates candidate developer recommendations while strictly filtering out all previous interactions.

### Key Code Walkthrough
```javascript
// 1. Find all connection requests where user is sender OR receiver
const connectionRequests = await ConnectionRequest.find({
    $or: [{ fromUserId: loggedInUser._id }, { toUserId: loggedInUser._id }],
}).select("fromUserId toUserId");

// 2. Build set of user IDs to hide
const hideUsersFromFeed = new Set();
connectionRequests.forEach((reqDoc) => {
    hideUsersFromFeed.add(reqDoc.fromUserId.toString());
    hideUsersFromFeed.add(reqDoc.toUserId.toString());
});
hideUsersFromFeed.add(loggedInUser._id.toString()); // Hide self

// 3. Query candidates using $nin with pagination and projection
const feedUsers = await User.find({
    _id: { $nin: Array.from(hideUsersFromFeed) },
})
    .select("firstName lastName photoUrl age gender about skills")
    .skip(skip)
    .limit(limit);
```
- **Why it matters:** A user must never see: (1) themselves, (2) users they have liked or ignored, (3) users who have sent them a request, or (4) confirmed connections. Using a JavaScript `Set` guarantees deduplication before submitting the array to MongoDB.
- **Interviewer Question:** *"What is the time complexity of building `hideUsersFromFeed` and how would you optimize it for high volume?"*
- **Your Answer:** *"Populating the Set is $O(M)$ where $M$ is the user's connection requests. The MongoDB query uses `$nin`, which scans the index on `_id`. At massive scale with millions of requests, passing large arrays to `$nin` increases memory overhead; in that scenario, I would refactor to a MongoDB `$lookup` pipeline or pre-compute recommendations into a Redis cache."*

---

## 3. `src/routes/auth.js` (Registration Pre-Check & Token Reset)

- **File Path**: [`src/routes/auth.js`](file:///c:/Backend/hackpair-backend/src/routes/auth.js)

### Optimized Registration Pre-Check
```javascript
const userEmail = (email || emailId)?.toLowerCase().trim();

// Pre-check before hashing saves ~100ms of CPU compute on duplicate attempts
const existingUser = await User.findOne({ email: userEmail });
if (existingUser) {
    return res.status(400).send("You already have an account! Please log in.");
}

const passwordHash = await bcrypt.hash(password, 10);
```
- **Why it matters:** Bcrypt hashing with cost factor 10 is intentionally CPU-intensive. If a malicious actor or script spams duplicate signup requests, hashing passwords before checking the database creates severe CPU starvation. Checking `User.findOne` first saves CPU compute cycles on rejected requests.

---

## 4. `src/models/user.js` (Schema Transforms & Encapsulation)

- **File Path**: [`src/models/user.js`](file:///c:/Backend/hackpair-backend/src/models/user.js)

### Serialization Transform
```javascript
toJSON: {
    transform: function (doc, ret) {
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.__v;
        return ret;
    },
}
```
- **Why it matters:** In traditional Express apps, developers frequently forget to strip the `password` field before sending user objects, resulting in password hash exposure. By embedding the transform directly into Mongoose's `toJSON` lifecycle, every `res.send(user)` or `res.json(user)` automatically and permanently excludes the hash.

---

## 5. `src/models/connectionRequest.js` (Database Integrity & Pre-Save)

- **File Path**: [`src/models/connectionRequest.js`](file:///c:/Backend/hackpair-backend/src/models/connectionRequest.js)

### Self-Connection Prevention Hook
```javascript
connectionRequestSchema.pre("save", function (next) {
    if (this.fromUserId.equals(this.toUserId)) {
        throw new Error("Cannot send connection request to yourself!");
    }
    if (typeof next === "function") next();
});
```
- **Why it matters:** Defense-in-depth. Validations should not exist solely in route controllers. Enforcing self-matching restrictions inside a Mongoose `pre-save` hook guarantees that no API endpoint or background script can ever corrupt database relational integrity.

---

## 6. `src/routes/chat.js` (Conversation Merging & Auto-Mark Seen)

- **File Path**: [`src/routes/chat.js`](file:///c:/Backend/hackpair-backend/src/routes/chat.js)

### Dynamic Merging Pattern
`GET /chat/conversations` queries all `ConnectionRequest` documents with `status: "accepted"`, queries all `Chat` documents, and merges them in memory:
- If two partners already chatted, it computes the latest message text, timestamp, and unread count.
- If two partners connected but have not exchanged messages yet, it appends a placeholder: `"Start a conversation"`.
- It sorts the final merged array by `lastMessageTime` descending so the most active teammate is always on top.

---

## 7. `src/context/AuthContext.jsx` (Client Session Hydration)

- **File Path**: [`src/context/AuthContext.jsx`](file:///c:/personal-projects/hackpair-frontend/src/context/AuthContext.jsx)

### Initial Hydration Flow
```javascript
useEffect(() => {
    const initializeAuth = async () => {
        try {
            const response = await api.get("/profile/view");
            setUser(response.data);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };
    initializeAuth();
}, []);
```
- **Why it matters:** Implements clean, declarative session synchronization on client load. If the user possesses a valid 7-day cookie, `setUser` is called and routes render instantly without redirecting.

---

## 8. `ChatPageView/index.jsx` (2-Column Messenger Interface)

- **File Path**: [`src/app/resources/components/chat/chat-page-view/index.jsx`](file:///c:/personal-projects/hackpair-frontend/src/app/resources/components/chat/chat-page-view/index.jsx)

### Auto-Selection & Real-Time Sync
```javascript
const queryUserId = searchParams.get("userId");

// Auto-selects partner if navigated from /connections?userId=...
if (queryUserId) {
    const targetConv = list.find((c) => c.partner?._id?.toString() === queryUserId.toString());
    if (targetConv) setSelectedPartner(targetConv.partner);
}
```
- **Why it matters:** Bridges the gap between social discovery (`/connections`) and active messaging (`/chat`). Clicking "Chat" on a connection card loads the full conversation immediately without extra clicks.

