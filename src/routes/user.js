const express = require("express");
const userRouter = express.Router();
const { userAuth } = require("../middlewares/auth");
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");

// Safe fields to expose from the referenced User document
const USER_SAFE_DATA = "firstName lastName photoUrl age gender about skills";

// Get all pending connection requests received by the logged-in user
// Accessible via GET /user/requests/received (and alias GET /user/requests)
const getReceivedRequestsHandler = async (req, res) => {
    try {
        const loggedInUser = req.user;

        // Find all requests where:
        // - toUserId is the loggedInUser
        // - status is "interested" (pending review)
        // .populate replaces fromUserId (ObjectId) with the actual User document details
        const connectionRequests = await ConnectionRequest.find({
            toUserId: loggedInUser._id,
            status: "interested",
        }).populate("fromUserId", USER_SAFE_DATA);

        res.json({
            message: "Connection requests fetched successfully",
            data: connectionRequests,
        });
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
};

userRouter.get("/user/requests/received", userAuth, getReceivedRequestsHandler);
userRouter.get("/user/requests", userAuth, getReceivedRequestsHandler);

// Get all accepted connections for the logged-in user - GET /user/connections
userRouter.get("/user/connections", userAuth, async (req, res) => {
    try {
        const loggedInUser = req.user;

        // Find all connection requests where status is "accepted" and
        // loggedInUser is either the sender (fromUserId) or the receiver (toUserId)
        const connectionRequests = await ConnectionRequest.find({
            $or: [
                { toUserId: loggedInUser._id, status: "accepted" },
                { fromUserId: loggedInUser._id, status: "accepted" },
            ],
        })
            .populate("fromUserId", USER_SAFE_DATA)
            .populate("toUserId", USER_SAFE_DATA);

        // Map over records and extract only the other user's profile (not our own)
        const data = connectionRequests
            .map((row) => {
                if (row.fromUserId && row.fromUserId._id.toString() === loggedInUser._id.toString()) {
                    return row.toUserId;
                }
                return row.fromUserId;
            })
            .filter((user) => user !== null);

        res.json({
            message: "Connections fetched successfully",
            data,
        });
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
});

// Get Feed API - GET /feed and GET /user/feed
// Returns all user profiles that the logged-in user can connect with,
// excluding: (1) self, (2) users already connected with, (3) users already sent or received a request from
userRouter.get(["/feed", "/user/feed"], userAuth, async (req, res) => {
    try {
        const loggedInUser = req.user;

        // Pagination parameters
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        let limit = Math.max(parseInt(req.query.limit) || 10, 1);
        limit = limit > 50 ? 50 : limit;
        const skip = (page - 1) * limit;

        // 1. Find all connection requests involving the logged-in user (as sender or receiver)
        const connectionRequests = await ConnectionRequest.find({
            $or: [
                { fromUserId: loggedInUser._id },
                { toUserId: loggedInUser._id },
            ],
        }).select("fromUserId toUserId");

        // 2. Collect all IDs that should be hidden from the feed
        const hideUsersFromFeed = new Set();
        connectionRequests.forEach((reqDoc) => {
            hideUsersFromFeed.add(reqDoc.fromUserId.toString());
            hideUsersFromFeed.add(reqDoc.toUserId.toString());
        });

        // 3. Ensure the logged-in user themselves is never shown in their own feed
        hideUsersFromFeed.add(loggedInUser._id.toString());

        // 4. Query all users whose _id is NOT in the hidden set
        const feedUsers = await User.find({
            _id: { $nin: Array.from(hideUsersFromFeed) },
        })
            .select(USER_SAFE_DATA)
            .skip(skip)
            .limit(limit);

        res.json({
            message: "Feed fetched successfully",
            page,
            limit,
            data: feedUsers,
        });
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
});

module.exports = userRouter;

