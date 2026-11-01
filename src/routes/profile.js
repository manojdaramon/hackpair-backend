const express = require("express");
const profileRouter = express.Router();
const bcrypt = require("bcrypt");
const validator = require("validator");
const { userAuth } = require("../middlewares/auth");
const { validateEditProfileData } = require("../utils/validation");

// Profile View API - GET /profile/view and GET /profile
const profileViewHandler = async (req, res) => {
    try {
        const user = req.user;
        res.send(user);
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
};

profileRouter.get("/profile/view", userAuth, profileViewHandler);
profileRouter.get("/profile", userAuth, profileViewHandler);

// Edit Profile API - PATCH /profile/edit
profileRouter.patch("/profile/edit", userAuth, async (req, res) => {
    try {
        // Validate incoming edit fields
        validateEditProfileData(req);

        const loggedInUser = req.user;

        Object.keys(req.body).forEach((key) => {
            loggedInUser[key] = req.body[key];
        });

        await loggedInUser.save();

        res.json({
            message: `${loggedInUser.firstName}, your profile was updated successfully`,
            data: loggedInUser,
        });
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
});

// Change Password API - PATCH /profile/password
profileRouter.patch("/profile/password", userAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).send("Current password and new password are required");
        }

        const user = req.user;

        // Verify current password using schema method
        const isCurrentPasswordValid = await user.validatePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(400).send("Invalid current password");
        }

        // Validate new password strength
        if (!validator.isStrongPassword(newPassword)) {
            return res.status(400).send(
                "Please enter a strong password (minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 symbol)"
            );
        }

        // Encrypt and update password
        const passwordHash = await bcrypt.hash(newPassword, 10);
        user.password = passwordHash;
        await user.save();

        res.send("Password changed successfully!");
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
});

module.exports = profileRouter;

