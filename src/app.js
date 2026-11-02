const express = require("express");
const mongoose = require("mongoose");
const validator = require("validator");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/database");
const User = require("./models/user");
const { validateEditProfileData } = require("./utils/validation");

const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile");
const requestRouter = require("./routes/requests");
const userRouter = require("./routes/user");

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/", authRouter);
app.use("/", profileRouter);
app.use("/", requestRouter);
app.use("/", userRouter);

app.get("/test", (req, res) => {
    res.send("Server started ");
});

app.get("/main", (req, res) => {
    res.send("another route");
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

