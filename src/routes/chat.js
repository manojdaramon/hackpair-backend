const express = require("express");
const mongoose = require("mongoose");
const chatRouter = express.Router();
const { userAuth } = require("../middlewares/auth");
const Chat = require("../models/chat");
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");

// 1. Get total unread message count across all conversations
// GET /chat/unread-count
chatRouter.get("/chat/unread-count", userAuth, async (req, res) => {
    try {
        const loggedInUserId = req.user._id;

        const chats = await Chat.find({
            participants: loggedInUserId,
        }).select("messages");

        let totalUnread = 0;
        chats.forEach((chat) => {
            chat.messages.forEach((msg) => {
                if (
                    msg.senderId &&
                    msg.senderId.toString() !== loggedInUserId.toString() &&
                    !msg.seen
                ) {
                    totalUnread++;
                }
            });
        });

        res.json({ success: true, unreadCount: totalUnread });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch unread count: " + err.message });
    }
});

// 2. Get list of all conversation threads (merges accepted connections with recent chat history)
// GET /chat/conversations
chatRouter.get("/chat/conversations", userAuth, async (req, res) => {
    try {
        const loggedInUserId = req.user._id;

        // Fetch all accepted connections for the logged-in user
        const acceptedConnections = await ConnectionRequest.find({
            $or: [
                { fromUserId: loggedInUserId, status: "accepted" },
                { toUserId: loggedInUserId, status: "accepted" },
            ],
        })
            .populate("fromUserId", "firstName lastName photoUrl about skills")
            .populate("toUserId", "firstName lastName photoUrl about skills");

        // Extract the partner profile objects
        const partnersMap = new Map();
        acceptedConnections.forEach((row) => {
            const partner =
                row.fromUserId && row.fromUserId._id.toString() === loggedInUserId.toString()
                    ? row.toUserId
                    : row.fromUserId;

            if (partner && partner._id) {
                partnersMap.set(partner._id.toString(), partner);
            }
        });

        // Fetch all chat documents for this user
        const chats = await Chat.find({
            participants: loggedInUserId,
        });

        // Build conversation items
        const conversations = [];

        // Track which partners already have a chat document
        const processedPartnerIds = new Set();

        chats.forEach((chat) => {
            const partnerId = chat.participants
                .find((p) => p.toString() !== loggedInUserId.toString())
                ?.toString();

            if (!partnerId || !partnersMap.has(partnerId)) {
                return;
            }

            processedPartnerIds.add(partnerId);
            const partner = partnersMap.get(partnerId);

            const lastMessage =
                chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;

            let unreadCount = 0;
            chat.messages.forEach((msg) => {
                if (
                    msg.senderId &&
                    msg.senderId.toString() !== loggedInUserId.toString() &&
                    !msg.seen
                ) {
                    unreadCount++;
                }
            });

            conversations.push({
                partner,
                lastMessage: lastMessage ? lastMessage.text : "No messages yet",
                lastMessageTime: lastMessage ? lastMessage.createdAt : chat.updatedAt,
                unreadCount,
            });
        });

        // Add any remaining accepted partners who haven't started a chat yet
        partnersMap.forEach((partner, partnerId) => {
            if (!processedPartnerIds.has(partnerId)) {
                conversations.push({
                    partner,
                    lastMessage: "Start a conversation",
                    lastMessageTime: null,
                    unreadCount: 0,
                });
            }
        });

        // Sort: most recent message at the top
        conversations.sort((a, b) => {
            if (!a.lastMessageTime) return 1;
            if (!b.lastMessageTime) return -1;
            return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
        });

        res.json({
            success: true,
            conversations,
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch conversations: " + err.message });
    }
});

// 3. Fetch chat history with a specific partner and mark incoming messages as seen
// GET /chat/:targetUserId
chatRouter.get("/chat/:targetUserId", userAuth, async (req, res) => {
    try {
        const loggedInUserId = req.user._id;
        const { targetUserId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).json({ message: "Invalid Target User ID" });
        }

        const targetUser = await User.findById(targetUserId).select(
            "firstName lastName photoUrl about skills"
        );
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Security check: Must be accepted connections
        const isConnected = await ConnectionRequest.findOne({
            $or: [
                { fromUserId: loggedInUserId, toUserId: targetUserId, status: "accepted" },
                { fromUserId: targetUserId, toUserId: loggedInUserId, status: "accepted" },
            ],
        });

        if (!isConnected) {
            return res.status(403).json({
                message: "You can only view chat history with accepted connections.",
            });
        }

        const chat = await Chat.findOne({
            participants: { $all: [loggedInUserId, targetUserId] },
        });

        // Mark incoming messages as seen
        if (chat && chat.messages.length > 0) {
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
            }
        }

        res.json({
            success: true,
            targetUser,
            messages: chat ? chat.messages : [],
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch chat history: " + err.message });
    }
});

// 4. Mark messages as seen
// PATCH /chat/mark-seen/:targetUserId
chatRouter.patch("/chat/mark-seen/:targetUserId", userAuth, async (req, res) => {
    try {
        const loggedInUserId = req.user._id;
        const { targetUserId } = req.params;

        const chat = await Chat.findOne({
            participants: { $all: [loggedInUserId, targetUserId] },
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
            }
        }

        res.json({ success: true, message: "Messages marked as seen" });
    } catch (err) {
        res.status(500).json({ message: "Error marking seen: " + err.message });
    }
});

module.exports = chatRouter;
