require("dotenv").config();
const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const validator = require("validator");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/database");
const User = require("./models/user");
const { validateEditProfileData } = require("./utils/validation");
const { userAuth } = require("./middlewares/auth");
const { initializeSocket } = require("./utils/socket");

const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile");
const requestRouter = require("./routes/requests");
const userRouter = require("./routes/user");
const chatRouter = require("./routes/chat");

const app = express();

// Security HTTP headers
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
    })
);

// Dynamic CORS whitelist
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.replace(/\/$/, "")] : []),
    ...(process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim().replace(/\/$/, ""))
        : []),
];

app.use(
    cors({
        origin: allowedOrigins,
        credentials: true,
    })
);

// Rate limiter for authentication routes to prevent brute-force attacks
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 25, // limit each IP to 25 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many authentication requests, please try again after 15 minutes.",
});

app.use("/login", authRateLimiter);
app.use("/signup", authRateLimiter);
app.use("/forgotPassword", authRateLimiter);
app.use("/forgot-password", authRateLimiter);
app.use("/resetPassword", authRateLimiter);
app.use("/reset-password", authRateLimiter);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(cookieParser());

// Application Routers
app.use("/", authRouter);
app.use("/", profileRouter);
app.use("/", requestRouter);
app.use("/", userRouter);
app.use("/", chatRouter);

app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/test", (req, res) => {
    res.send("Server started ");
});

// Get User by email - GET /user (Requires Authentication)
app.get("/user", userAuth, async (req, res) => {
    const userEmail = req.query.email || req.body?.email || req.body?.emailId;

    if (!userEmail) {
        return res.status(400).send("Email is required");
    }

    if (!validator.isEmail(userEmail)) {
        return res.status(400).send("Invalid email address: " + userEmail);
    }

    try {
        const users = await User.find({
            email: userEmail.toLowerCase().trim(),
        }).select("firstName lastName photoUrl age gender about skills");

        if (users.length === 0) {
            return res.status(404).send("User not found");
        }

        res.send(users);
    } catch (err) {
        res.status(400).send("Something went wrong: " + err.message);
    }
});

// Delete user API - DELETE /user or DELETE /user/:userId (Protected against IDOR)
const deleteUserHandler = async (req, res) => {
    const targetUserId = req.params.userId || req.body?.userId || req.query?.userId || req.user._id.toString();

    if (!targetUserId) {
        return res.status(400).send("User ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return res.status(400).send("Invalid User ID format");
    }

    // IDOR Protection: Users can only delete their OWN account
    if (targetUserId.toString() !== req.user._id.toString()) {
        return res.status(403).send("Forbidden: You can only delete your own account");
    }

    try {
        const user = await User.findByIdAndDelete(targetUserId);
        if (!user) {
            return res.status(404).send("User not found");
        }
        res.send("User deleted successfully!");
    } catch (err) {
        res.status(400).send("Something went wrong: " + err.message);
    }
};

app.delete("/user/:userId", userAuth, deleteUserHandler);
app.delete("/user", userAuth, deleteUserHandler);

// Update user data API - PATCH /user or PATCH /user/:userId (Protected against IDOR)
const updateUserHandler = async (req, res) => {
    const targetUserId = req.params.userId || req.body?.userId || req.query?.userId || req.user._id.toString();

    if (!targetUserId) {
        return res.status(400).send("User ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return res.status(400).send("Invalid User ID format");
    }

    // IDOR Protection: Users can only update their OWN account
    if (targetUserId.toString() !== req.user._id.toString()) {
        return res.status(403).send("Forbidden: You can only update your own account");
    }

    try {
        validateEditProfileData(req);

        const data = { ...req.body };
        delete data.userId;
        delete data._id;

        const user = await User.findByIdAndUpdate(targetUserId, data, {
            returnDocument: "after",
            runValidators: true,
        });

        if (!user) {
            return res.status(404).send("User not found");
        }

        res.send("User updated successfully");
    } catch (err) {
        res.status(400).send("Error updating user: " + err.message);
    }
};

app.patch("/user/:userId", userAuth, updateUserHandler);
app.patch("/user", userAuth, updateUserHandler);

// Handle undefined routes
app.use((req, res) => {
    res.status(404).send("Route not found");
});

const PORT = process.env.PORT || 7777;

// Create HTTP server wrapping Express application
const server = http.createServer(app);

// Initialize Socket.IO with CORS settings
initializeSocket(server, allowedOrigins);

connectDB()
    .then(() => {
        console.log("Database connection established...");
        server.listen(PORT, () => {
            console.log(`Server is successfully listening on port ${PORT}...`);
            console.log(`⚡ Live chat WebSocket ready on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Database cannot be connected!!", err.message);
    });
