const express = require("express");
const authRouter = express.Router();
const bcrypt = require("bcrypt");
const validator = require("validator");
const User = require("../models/user");
const { validateSignUpData } = require("../utils/validation");

// Signup API - POST /signup
authRouter.post("/signup", async (req, res) => {
    try {
        // Validate request body
        validateSignUpData(req);

        const { firstName, lastName, email, emailId, password, age, gender, photoUrl, about, skills } = req.body;

        // Encrypt the password using bcrypt
        const passwordHash = await bcrypt.hash(password, 10);

        const user = new User({
            firstName,
            lastName,
            email: email || emailId,
            password: passwordHash,
            age,
            gender,
            photoUrl,
            about,
            skills,
        });

        await user.save();
        res.status(201).send("User Added Successfully!");
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).send("Error saving the user: Email already exists");
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

        // Add token to cookie and send response back to user
        res.cookie("token", token, {
            expires: new Date(Date.now() + 7 * 24 * 3600000),
        });

        res.send(user);
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
});

// Logout API - POST /logout
authRouter.post("/logout", async (req, res) => {
    res.cookie("token", null, {
        expires: new Date(Date.now()),
    });
    res.send("Logout Successful!!");
});

// Forgot Password API - POST /forgotPassword (and /forgot-password)
authRouter.post(["/forgotPassword", "/forgot-password"], async (req, res) => {
    try {
        const { email, emailId, newPassword, password } = req.body;
        const userEmail = email || emailId;
        const updatedPassword = newPassword || password;

        if (!userEmail) {
            return res.status(400).send("Email is required");
        }

        if (!updatedPassword) {
            return res.status(400).send("New password is required");
        }

        if (!validator.isEmail(userEmail)) {
            return res.status(400).send("Invalid email address: " + userEmail);
        }

        if (!validator.isStrongPassword(updatedPassword)) {
            return res.status(400).send(
                "Please enter a strong password (minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 symbol)"
            );
        }

        const user = await User.findOne({ email: userEmail.toLowerCase().trim() });
        if (!user) {
            return res.status(404).send("User not found with this email");
        }

        // Encrypt the new password
        const passwordHash = await bcrypt.hash(updatedPassword, 10);
        user.password = passwordHash;
        await user.save();

        res.send("Password updated successfully! Please login with your new password.");
    } catch (err) {
        res.status(400).send("ERROR: " + err.message);
    }
});

module.exports = authRouter;

