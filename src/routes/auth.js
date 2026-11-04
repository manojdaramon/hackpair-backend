const express = require("express");
const authRouter = express.Router();
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const validator = require("validator");
const User = require("../models/user");
const { validateSignUpData } = require("../utils/validation");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../services/emailService");

// Signup API - POST /signup
authRouter.post("/signup", async (req, res) => {
    try {
        // Validate request body
        validateSignUpData(req);

        const { firstName, lastName, email, emailId, password, age, gender, photoUrl, about, skills } = req.body;
        const userEmail = (email || emailId)?.toLowerCase().trim();

        // Check if user already exists
        const existingUser = await User.findOne({ email: userEmail });
        if (existingUser) {
            return res.status(400).send("You already have an account! Please log in.");
        }

        // Encrypt the password using bcrypt
        const passwordHash = await bcrypt.hash(password, 10);

        const user = new User({
            firstName,
            lastName,
            email: userEmail,
            password: passwordHash,
            age,
            gender,
            photoUrl,
            about,
            skills,
        });

        await user.save();

        // Send welcome email asynchronously (non-blocking)
        sendWelcomeEmail(user).catch((err) =>
            console.error("Welcome email error:", err.message)
        );

        res.status(201).send("User Added Successfully!");
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).send("You already have an account! Please log in.");
        }
        res.status(400).send("Error saving the user: " + err.message);
    }
});

// Login API - POST /login
authRouter.post("/login", async (req, res) => {
    try {
        const { email, emailId, password } = req.body;
        const userEmail = email || emailId;

        if (!userEmail || !password) {
            return res.status(400).send("Email and password are required");
        }

        if (!validator.isEmail(userEmail)) {
            return res.status(400).send("Invalid email address: " + userEmail);
        }

        const user = await User.findOne({ email: userEmail.toLowerCase().trim() });
        if (!user) {
            return res.status(400).send("Invalid credentials");
        }

        const isPasswordValid = await user.validatePassword(password);
        if (!isPasswordValid) {
            return res.status(400).send("Invalid credentials");
        }

        // Create a JWT Token using schema method
        const token = await user.getJWT();

        // Add token to cookie with secure flags
        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("token", token, {
            expires: new Date(Date.now() + 7 * 24 * 3600000),
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
        });

        res.send(user);
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
});

// Logout API - POST /logout
authRouter.post("/logout", async (req, res) => {
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("token", null, {
        expires: new Date(0),
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
    });
    res.send("Logout Successful!!");
});

// Request Password Reset API - POST /forgotPassword (and /forgot-password)
authRouter.post(["/forgotPassword", "/forgot-password"], async (req, res) => {
    try {
        const { email, emailId } = req.body;
        const userEmail = email || emailId;

        if (!userEmail) {
            return res.status(400).send("Email is required");
        }

        if (!validator.isEmail(userEmail)) {
            return res.status(400).send("Invalid email address: " + userEmail);
        }

        const normalizedEmail = userEmail.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        // Always return success message to prevent user enumeration
        if (!user) {
            return res.send(
                "If an account with that email exists, we have sent password reset instructions to it."
            );
        }

        // Generate cryptographically secure random token (32 bytes = 64 hex chars)
        const resetToken = crypto.randomBytes(32).toString("hex");

        // Hash token before storing in database (OWASP security standard)
        const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes validity
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;

        // Send reset email asynchronously
        sendPasswordResetEmail({ user, resetUrl }).catch((err) =>
            console.error("Password reset email error:", err.message)
        );

        res.send(
            "If an account with that email exists, we have sent password reset instructions to it."
        );
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
});

// Reset Password with Token API - POST /resetPassword (and /reset-password)
authRouter.post(["/resetPassword", "/reset-password"], async (req, res) => {
    try {
        const { token, email, emailId, newPassword, password } = req.body;
        const userEmail = email || emailId;
        const updatedPassword = newPassword || password;

        if (!token) {
            return res.status(400).send("Reset token is required");
        }

        if (!userEmail) {
            return res.status(400).send("Email is required");
        }

        if (!updatedPassword) {
            return res.status(400).send("New password is required");
        }

        if (!validator.isStrongPassword(updatedPassword)) {
            return res.status(400).send(
                "Please enter a strong password (minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 symbol)"
            );
        }

        // Hash the incoming token to match against the hashed token in database
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        const normalizedEmail = userEmail.toLowerCase().trim();

        const user = await User.findOne({
            email: normalizedEmail,
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).send(
                "Invalid or expired password reset token. Please request a new one."
            );
        }

        // Update password and clear reset token
        user.password = await bcrypt.hash(updatedPassword, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.send("Password reset successfully! Please log in with your new password.");
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
});

module.exports = authRouter;

