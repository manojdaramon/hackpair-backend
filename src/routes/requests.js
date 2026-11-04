const express = require("express");
const mongoose = require("mongoose");
const requestRouter = express.Router();
const { userAuth } = require("../middlewares/auth");
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");
const {
    sendConnectionRequestEmail,
    sendConnectionAcceptedEmail,
} = require("../services/emailService");

// Send Connection Request API - POST /request/send/:status/:toUserId
requestRouter.post(
    "/request/send/:status/:toUserId",
    userAuth,
    async (req, res) => {
        try {
            const fromUserId = req.user._id;
            const toUserId = req.params.toUserId;
            const status = req.params.status;

            // 1. Only "ignored" and "interested" statuses are allowed for sending a request
            const allowedStatus = ["ignored", "interested"];
            if (!allowedStatus.includes(status)) {
                return res
                    .status(400)
                    .json({ message: "Invalid status type: " + status });
            }

            // 2. Validate toUserId format
            if (!mongoose.Types.ObjectId.isValid(toUserId)) {
                return res.status(400).json({ message: "Invalid user ID" });
            }

            // 3. Ensure recipient user exists in the database
            const toUser = await User.findById(toUserId);
            if (!toUser) {
                return res.status(404).json({ message: "User not found!" });
            }

            // 4. Check if connection request already exists between these two users (in either direction)
            const existingConnectionRequest = await ConnectionRequest.findOne({
                $or: [
                    { fromUserId, toUserId },
                    { fromUserId: toUserId, toUserId: fromUserId },
                ],
            });

            if (existingConnectionRequest) {
                return res
                    .status(400)
                    .json({ message: "Connection Request Already Exists!!" });
            }

            // 5. Create and save new connection request (.pre hook validates fromUserId !== toUserId)
            const connectionRequest = new ConnectionRequest({
                fromUserId,
                toUserId,
                status,
            });

            const data = await connectionRequest.save();

            // Notify recipient asynchronously when interest is expressed
            if (status === "interested") {
                sendConnectionRequestEmail({
                    recipient: toUser,
                    sender: req.user,
                }).catch((err) =>
                    console.error("Connection request email error:", err.message)
                );
            }

            res.json({
                message:
                    req.user.firstName +
                    (status === "interested" ? " is interested in " : " ignored ") +
                    toUser.firstName,
                data,
            });
        } catch (err) {
            res.status(400).send("ERROR: " + err.message);
        }
    }
);

// Review Connection Request API - POST /request/review/:status/:requestId
requestRouter.post(
    "/request/review/:status/:requestId",
    userAuth,
    async (req, res) => {
        try {
            const loggedInUser = req.user;
            const { status, requestId } = req.params;

            // 1. Validate status: only "accepted" and "rejected" allowed
            const allowedStatus = ["accepted", "rejected"];
            if (!allowedStatus.includes(status)) {
                return res
                    .status(400)
                    .json({ message: "Status not allowed! Allowed statuses: accepted, rejected" });
            }

            // 2. Validate requestId format
            if (!mongoose.Types.ObjectId.isValid(requestId)) {
                return res.status(400).json({ message: "Invalid Request ID" });
            }

            // 3. Find connection request:
            // - _id must match requestId
            // - toUserId must match loggedInUser._id (only the recipient can review)
            // - status must be "interested" (cannot review already accepted/rejected/ignored requests)
            const connectionRequest = await ConnectionRequest.findOne({
                _id: requestId,
                toUserId: loggedInUser._id,
                status: "interested",
            });

            if (!connectionRequest) {
                return res
                    .status(404)
                    .json({ message: "Connection request not found" });
            }

            // 4. Update status and save
            connectionRequest.status = status;
            const data = await connectionRequest.save();

            // Notify original sender asynchronously when request is accepted
            if (status === "accepted") {
                User.findById(connectionRequest.fromUserId)
                    .then((originalSender) => {
                        if (originalSender) {
                            sendConnectionAcceptedEmail({
                                recipient: originalSender,
                                accepter: loggedInUser,
                            }).catch((err) =>
                                console.error("Connection accepted email error:", err.message)
                            );
                        }
                    })
                    .catch((err) =>
                        console.error("Error finding sender for accept email:", err.message)
                    );
            }

            res.json({
                message: "Connection request " + status,
                data,
            });
        } catch (err) {
            res.status(400).send("ERROR: " + err.message);
        }
    }
);

// Legacy handler for earlier chapter
const sendConnectionRequestHandler = async (req, res) => {
    try {
        const user = req.user;
        console.log("Sending a connection request");
        res.send(user.firstName + " sent the Connect Request!");
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
};

requestRouter.post("/sendConnectionRequest", userAuth, sendConnectionRequestHandler);
requestRouter.get("/sendConnectionRequest", userAuth, sendConnectionRequestHandler);

module.exports = requestRouter;
