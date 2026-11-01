const express = require("express");
const requestRouter = express.Router();
const { userAuth } = require("../middlewares/auth");

// Send Connection Request API - POST /sendConnectionRequest
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

