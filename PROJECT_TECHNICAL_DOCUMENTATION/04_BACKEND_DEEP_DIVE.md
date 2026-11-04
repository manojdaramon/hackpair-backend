# Document 04: Backend Architecture & Deep Dive

## 1. Server Initialization & Middleware Pipeline

The HackPair backend entry point is located at [`src/app.js`](file:///c:/Backend/hackpair-backend/src/app.js). The application wraps an Express 5 pipeline inside Node's native HTTP module (`http.createServer(app)`), enabling both RESTful HTTP endpoints and WebSocket traffic on the same listening port (`process.env.PORT || 7777`).

```
[ Incoming HTTP Request ]
          │
          ▼
┌─────────────────────────────────┐
│ 1. Helmet Security Headers      │  Sets CSP, X-Frame-Options, hides X-Powered-By
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 2. Dynamic CORS Middleware      │  Matches origin against whitelist (FRONTEND_URL, ALLOWED_ORIGINS)
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 3. Express Rate Limiter         │  25 requests / 15 mins on sensitive endpoints (/login, /signup)
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 4. Body Parsers & Cookie Parser │  express.json(5mb), express.urlencoded(5mb), cookieParser()
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 5. Application Routers          │  /auth, /profile, /requests, /user, /chat
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 6. userAuth Middleware          │  Verifies JWT cookie, attaches req.user
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 7. Business Logic & ODM Save    │  Mongoose validation, query aggregation, DB write
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 8. Non-blocking Async Services  │  Triggers email dispatch (Nodemailer/Resend) without awaiting
└────────────────┬────────────────┘
                 ▼
[ JSON Response Sent to Client ]
```

---

## 2. Middleware Architecture

### A. Authentication Middleware (`src/middlewares/auth.js`)
```javascript
const userAuth = async (req, res, next) => {
    try {
        const { token } = req.cookies;
        if (!token) {
            throw new Error("Token is not valid or missing! Please login.");
        }

        const decodedObj = jwt.verify(token, JWT_SECRET);
        const { _id } = decodedObj;

        const user = await User.findById(_id);
        if (!user) {
            throw new Error("User not found");
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(401).send("ERROR: " + err.message);
    }
};
```
- **Security Standard**: Emits `HTTP 401 Unauthorized` (rather than 400 Bad Request) on token invalidation or expiration, allowing frontend interceptors to clear stale state and redirect to `/login`.
- **Identity Attachment**: Attaches the authenticated Mongoose user instance directly to `req.user`, making it accessible to downstream handlers.

### B. Rate Limiting (`express-rate-limit`)
Mounted specifically on sensitive credential routes (`/login`, `/signup`, `/forgotPassword`, `/resetPassword`):
- Window: 15 minutes (`15 * 60 * 1000` ms).
- Max Requests: 25 requests per window per IP.
- Mitigates automated password spraying, credential stuffing, and email service quota exhaustion.

### C. Dynamic CORS Engine
```javascript
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.replace(/\/$/, "")] : []),
    ...(process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim().replace(/\/$/, ""))
        : []),
];

app.use(cors({ origin: allowedOrigins, credentials: true }));
```
Enables Cloudflare Pages (`*.pages.dev`) and production deployments to communicate with the backend while strictly allowing cookie credentials (`credentials: true`).

---

## 3. Router & Business Logic Deep Dive

### A. Authentication Router (`src/routes/auth.js`)
- **`POST /signup`**:
  1. Validates input schema via `validateSignUpData(req)`.
  2. Normalizes email to lowercase and trims whitespace.
  3. Pre-checks for existing accounts (`User.findOne({ email })`) **before** computing bcrypt hash, saving expensive CPU compute cycles.
  4. Hashes password with bcrypt (`saltRounds = 10`).
  5. Saves user to MongoDB.
  6. Dispatches `sendWelcomeEmail(user)` asynchronously (`.catch(...)`).
- **`POST /login`**:
  1. Validates email format with `validator.isEmail`.
  2. Locates user record in MongoDB.
  3. Compares password hash via schema instance method: `await user.validatePassword(password)`.
  4. Generates signed JWT token via `await user.getJWT()`.
  5. Attaches cookie with security flags:
     ```javascript
     res.cookie("token", token, {
         expires: new Date(Date.now() + 7 * 24 * 3600000),
         httpOnly: true,
         secure: process.env.NODE_ENV === "production",
         sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
     });
     ```
- **`POST /logout`**: Clears `token` cookie immediately (`expires: new Date(0)`).
- **`POST /forgotPassword`**: Cryptographic password reset token generator:
  1. Generates 32-byte secure random string via `crypto.randomBytes(32).toString("hex")`.
  2. Computes SHA-256 hash of the token and stores it in MongoDB with a 15-minute expiration (`Date.now() + 15 * 60 * 1000`).
  3. Dispatches reset link via email.
  4. Returns generic success message to prevent user enumeration attacks.
- **`POST /resetPassword`**:
  1. Verifies token hash and checks `$gt: Date.now()`.
  2. Hashes new password and clears reset token fields.

### B. Request & Matchmaking Router (`src/routes/requests.js`)
- **`POST /request/send/:status/:toUserId`**:
  - Enforces status whitelist: `["ignored", "interested"]`.
  - Verifies `toUserId` is a valid MongoDB ObjectId and recipient exists.
  - **Bi-directional duplicate check**:
    ```javascript
    const existingConnectionRequest = await ConnectionRequest.findOne({
        $or: [
            { fromUserId, toUserId },
            { fromUserId: toUserId, toUserId: fromUserId },
        ],
    });
    ```
  - When status is `"interested"`, triggers `sendConnectionRequestEmail({ recipient, sender })`.
- **`POST /request/review/:status/:requestId`**:
  - Enforces status whitelist: `["accepted", "rejected"]`.
  - Verifies recipient ownership: `toUserId: loggedInUser._id` and current status is `"interested"`.
  - When accepted, triggers `sendConnectionAcceptedEmail({ recipient: sender, accepter: loggedInUser })`.

### C. Discovery Feed Engine (`src/routes/user.js`)
The feed algorithm is one of the most critical database queries in the application:
```javascript
// src/routes/user.js - lines 75-120
userRouter.get(["/feed", "/user/feed"], userAuth, async (req, res) => {
    const loggedInUser = req.user;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    let limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

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

    // 3. Query all users not in the exclusion set with projection & pagination
    const feedUsers = await User.find({
        _id: { $nin: Array.from(hideUsersFromFeed) },
    })
        .select("firstName lastName photoUrl age gender about skills")
        .skip(skip)
        .limit(limit);

    res.json({ message: "Feed fetched successfully", page, limit, data: feedUsers });
});
```

---

## 4. Asynchronous Service Layer: Email Architecture

Located in [`src/services/emailService.js`](file:///c:/Backend/hackpair-backend/src/services/emailService.js):

- **Non-blocking Execution**: Email dispatches are never awaited within route response blocks. The HTTP response is returned immediately to the client, while email transport executes concurrently.
- **Multi-Provider Dual Transport**:
  - **Primary Transport**: Nodemailer Gmail SMTP (`EMAIL_USER` + `EMAIL_PASS`). Allows developers without custom domain DNS records to dispatch emails to any real recipient.
  - **Secondary Transport**: Resend Cloud API (`RESEND_API_KEY`). Activates for custom domains.
- **Branded Layout Wrapper**: All emails utilize a unified HTML responsive template (`wrapEmailTemplate`) featuring HackPair's dark indigo header, styled CTA action buttons, and automated copyright footer.

