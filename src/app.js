const express = require("express");
const mongoose = require("mongoose");
const validator = require("validator");
const connectDB = require("./config/database");
const User = require("./models/user");
const { validateSignUpData, validateEditProfileData } = require("./utils/validation");

const app = express();

app.use(express.json());

app.get("/test", (req, res) => {
    res.send("Server started ");
});

app.get("/main", (req, res) => {
    res.send("another route");
});

// Signup API - POST /signup
app.post("/signup", async (req, res) => {
    try {
        // Validate request body
        validateSignUpData(req);

        const { firstName, lastName, email, emailId, password, age, gender, photoUrl, about, skills } = req.body;

        const user = new User({
            firstName,
            lastName,
            email: email || emailId,
            password,
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

// Get User by email - GET /user
app.get("/user", async (req, res) => {
    const userEmail = req.query.email || req.body?.email || req.body?.emailId;

    if (!userEmail) {
        return res.status(400).send("Email is required");
    }

    if (!validator.isEmail(userEmail)) {
        return res.status(400).send("Invalid email address: " + userEmail);
    }

    try {
        const users = await User.find({
            email: userEmail,
        });

        if (users.length === 0) {
            return res.status(404).send("User not found");
        }

        res.send(users);
    } catch (err) {
        res.status(400).send("Something went wrong: " + err.message);
    }
});

// Feed API - GET /feed - get all the users from the database
app.get("/feed", async (req, res) => {
    try {
        const users = await User.find({});
        res.send(users);
    } catch (err) {
        res.status(400).send("Something went wrong: " + err.message);
    }
});

// Delete user API - DELETE /user or DELETE /user/:userId
const deleteUserHandler = async (req, res) => {
    const userId = req.params.userId || req.body?.userId || req.query?.userId;

    if (!userId) {
        return res.status(400).send("User ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).send("Invalid User ID format");
    }

    try {
        const user = await User.findByIdAndDelete(userId);
        if (!user) {
            return res.status(404).send("User not found");
        }
        res.send("User deleted successfully!");
    } catch (err) {
        res.status(400).send("Something went wrong: " + err.message);
    }
};

app.delete("/user/:userId", deleteUserHandler);
app.delete("/user", deleteUserHandler);

// Update user data API - PATCH /user or PATCH /user/:userId
const updateUserHandler = async (req, res) => {
    const userId = req.params.userId || req.body?.userId || req.query?.userId;

    if (!userId) {
        return res.status(400).send("User ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).send("Invalid User ID format");
    }

    try {
        // Validate request body for allowed update fields and constraints
        validateEditProfileData(req);

        const data = { ...req.body };
        delete data.userId;
        delete data._id;

        const user = await User.findByIdAndUpdate(userId, data, {
            returnDocument: "after",
            runValidators: true,
        });

        if (!user) {
            return res.status(404).send("User not found");
        }

        console.log(user);
        res.send("User updated successfully");
    } catch (err) {
        res.status(400).send("Error updating user: " + err.message);
    }
};

app.patch("/user/:userId", updateUserHandler);
app.patch("/user", updateUserHandler);

// Handle undefined routes
app.use((req, res) => {
    res.status(404).send("Route not found");
});

connectDB()
    .then(() => {
        console.log("Database connection established...");
        app.listen(7777, () => {
            console.log("Server is successfully listening on port 7777...");
        });
    })
    .catch((err) => {
        console.error("Database cannot be connected!!", err.message);
    });
