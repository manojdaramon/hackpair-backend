const express = require("express");
const connectDB = require("./config/database");
const app = express();
const User = require("./models/user");

app.use("/test", (req, res) => {
    res.send("Server started ");
});

app.use("/main", (req, res) => {
    res.send("another route");
});

app.use(express.json());

app.post("/signup", async (req, res) => {
    const user = new User(req.body);

    try {
        await user.save();
        res.send("User Added Successfully!");
    }
    catch (err) {
        res.status(400).send("Error saving the user: " + err.message);
    }
})

connectDB()
    .then(() => {
        console.log("Database connection established...");
        app.listen(7777, () => {
            console.log("Server is successfully listening on port 7777...");
        });
    })
    .catch((err) => {
        console.error("Database cannot be connected!!");
    });
