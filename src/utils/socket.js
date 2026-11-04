const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/user");
const ConnectionRequest = require("../models/connectionRequest");
const Chat = require("../models/chat");

const JWT_SECRET = process.env.JWT_SECRET || "DEV@HackPair$790";

const parseCookies = (cookieString) => {
    if (!cookieString) return {};
    return cookieString.split(";").reduce((res, c) => {
        const [key, ...v] = c.trim().split("=");
        if (key) res[key] = decodeURIComponent(v.join("="));
        return res;
    }, {});
};

const getRoomId = (userA, userB) => {
    return [userA.toString(), userB.toString()].sort().join("_");
};

const initializeSocket = (httpServer, allowedOrigins = []) => {
    const io = new Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            credentials: true,
            methods: ["GET", "POST"],
        },
        pingTimeout: 60000,
    });

    // Authentication middleware for Socket connections
    io.use(async (socket, next) => {
        try {
            const tokenFromAuth = socket.handshake.auth?.token;
            const cookies = parseCookies(socket.handshake.headers.cookie);
            const token = tokenFromAuth || cookies.token;

            if (!token) {
                return next(new Error("Authentication error: Token missing"));
            }

            const decoded = jwt.verify(token, JWT_SECRET);
            if (!decoded || !decoded._id) {
                return next(new Error("Authentication error: Invalid token"));
            }

            const user = await User.findById(decoded._id).select(
                "_id firstName lastName photoUrl email"
            );
            if (!user) {
                return next(new Error("Authentication error: User not found"));
            }

            socket.user = user;
            next();
        } catch (err) {
            next(new Error("Authentication error: " + err.message));
        }
    });

    io.on("connection", (socket) => {
        console.log(`🔌 [Socket.IO] User connected: ${socket.user.firstName} (${socket.user._id})`);

        // Join personal room for user-targeted notifications (e.g. unread badge updates)
        socket.join(socket.user._id.toString());

        // Event: Join a private chat room between two connected users
        socket.on("joinChat", async ({ targetUserId }) => {
            try {
                if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
                    return socket.emit("error", { message: "Invalid Target User ID" });
                }

                // Security check: Must be accepted connections to chat
                const isConnected = await ConnectionRequest.findOne({
                    $or: [
                        { fromUserId: socket.user._id, toUserId: targetUserId, status: "accepted" },
                        { fromUserId: targetUserId, toUserId: socket.user._id, status: "accepted" },
                    ],
                });

                if (!isConnected) {
                    return socket.emit("error", {
                        message: "You can only chat with accepted connections.",
                    });
                }

                const roomId = getRoomId(socket.user._id, targetUserId);
                socket.join(roomId);
                socket.emit("joinedRoom", { roomId, targetUserId });
                console.log(`💬 User ${socket.user.firstName} joined room ${roomId}`);
            } catch (err) {
                socket.emit("error", { message: "Failed to join room: " + err.message });
            }
        });

        // Event: Send a message in real-time
        socket.on("sendMessage", async ({ targetUserId, text }) => {
            try {
                if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
                    return socket.emit("error", { message: "Invalid Target User ID" });
                }

                const trimmedText = typeof text === "string" ? text.trim() : "";
                if (!trimmedText) {
                    return socket.emit("error", { message: "Message cannot be empty" });
                }

                if (trimmedText.length > 2000) {
                    return socket.emit("error", { message: "Message cannot exceed 2000 characters" });
                }

                // Security check: Verify connection status
                const isConnected = await ConnectionRequest.findOne({
                    $or: [
                        { fromUserId: socket.user._id, toUserId: targetUserId, status: "accepted" },
                        { fromUserId: targetUserId, toUserId: socket.user._id, status: "accepted" },
                    ],
                });

                if (!isConnected) {
                    return socket.emit("error", {
                        message: "Cannot send message: Users are not connected.",
                    });
                }

                // Find or create conversation document in MongoDB
                let chat = await Chat.findOne({
                    participants: { $all: [socket.user._id, targetUserId] },
                });

                if (!chat) {
                    chat = new Chat({
                        participants: [socket.user._id, targetUserId],
                        messages: [],
                    });
                }

                const messageDoc = {
                    senderId: socket.user._id,
                    text: trimmedText,
                    seen: false,
                    createdAt: new Date(),
                };

                chat.messages.push(messageDoc);
                await chat.save();

                const savedMessage = chat.messages[chat.messages.length - 1];
                const roomId = getRoomId(socket.user._id, targetUserId);

                const messagePayload = {
                    _id: savedMessage._id,
                    senderId: socket.user._id,
                    senderName: `${socket.user.firstName} ${socket.user.lastName || ""}`.trim(),
                    senderPhoto: socket.user.photoUrl,
                    text: trimmedText,
                    seen: false,
                    createdAt: savedMessage.createdAt,
                    targetUserId,
                };

                // Broadcast to active chat room
                io.to(roomId).emit("messageReceived", messagePayload);

                // Broadcast unread message notification to recipient's personal room for sidebar badge
                io.to(targetUserId.toString()).emit("newUnreadMessage", {
                    senderId: socket.user._id,
                    senderName: `${socket.user.firstName} ${socket.user.lastName || ""}`.trim(),
                    text: trimmedText,
                    createdAt: savedMessage.createdAt,
                });
            } catch (err) {
                console.error("❌ [Socket.IO] Error sending message:", err.message);
                socket.emit("error", { message: "Failed to send message: " + err.message });
            }
        });

        // Event: Mark messages from partner as seen
        socket.on("markAsSeen", async ({ targetUserId }) => {
            try {
                if (!targetUserId) return;

                const chat = await Chat.findOne({
                    participants: { $all: [socket.user._id, targetUserId] },
                });

                if (chat) {
                    let updated = false;
                    chat.messages.forEach((msg) => {
                        if (
                            msg.senderId &&
                            msg.senderId.toString() === targetUserId.toString() &&
                            !msg.seen
                        ) {
                            msg.seen = true;
                            updated = true;
                        }
                    });

                    if (updated) {
                        await chat.save();

                        const roomId = getRoomId(socket.user._id, targetUserId);
                        io.to(roomId).emit("messagesSeen", {
                            seenBy: socket.user._id,
                            partnerId: targetUserId,
                        });

                        // Notify user's personal room to decrement badge
                        io.to(socket.user._id.toString()).emit("unreadCountUpdated");
                    }
                }
            } catch (err) {
                console.error("❌ [Socket.IO] Error in markAsSeen:", err.message);
            }
        });

        // Typing indicators
        socket.on("typing", ({ targetUserId }) => {
            if (targetUserId) {
                const roomId = getRoomId(socket.user._id, targetUserId);
                socket.to(roomId).emit("userTyping", {
                    userId: socket.user._id,
                    isTyping: true,
                });
            }
        });

        socket.on("stopTyping", ({ targetUserId }) => {
            if (targetUserId) {
                const roomId = getRoomId(socket.user._id, targetUserId);
                socket.to(roomId).emit("userTyping", {
                    userId: socket.user._id,
                    isTyping: false,
                });
            }
        });

        socket.on("disconnect", () => {
            console.log(`🔌 [Socket.IO] User disconnected: ${socket.user.firstName}`);
        });
    });

    return io;
};

module.exports = {
    initializeSocket,
    getRoomId,
};
