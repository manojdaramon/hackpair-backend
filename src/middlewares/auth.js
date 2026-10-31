const jwt = require("jsonwebtoken");
const User = require("../models/user");

const JWT_SECRET = process.env.JWT_SECRET || "DEV@HackPair$790";

const userAuth = async (req, res, next) => {
    try {
        // Read the token from the request cookies
        const { token } = req.cookies;
        if (!token) {
            throw new Error("Token is not valid or missing! Please login.");
        }

        // Verify and decode token
        const decodedObj = jwt.verify(token, JWT_SECRET);
        const { _id } = decodedObj;

        // Find the user by ID
        const user = await User.findById(_id);
        if (!user) {
            throw new Error("User not found");
        }

        // Attach user to request object
        req.user = user;
        next();
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
};

module.exports = {
    userAuth,
    JWT_SECRET,
};

