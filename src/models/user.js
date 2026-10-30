const mongoose = require("mongoose");
const validator = require("validator");

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: [true, "First name is required"],
            trim: true,
            minLength: [2, "First name must be at least 2 characters"],
            maxLength: [50, "First name cannot exceed 50 characters"],
        },
        lastName: {
            type: String,
            trim: true,
            maxLength: [50, "Last name cannot exceed 50 characters"],
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            validate(value) {
                if (!validator.isEmail(value)) {
                    throw new Error("Invalid email address: " + value);
                }
            },
        },
        password: {
            type: String,
            required: [true, "Password is required"],
        },
        age: {
            type: Number,
            min: [18, "Age must be at least 18"],
            max: [120, "Age cannot exceed 120"],
        },
        gender: {
            type: String,
            lowercase: true,
            trim: true,
            validate(value) {
                if (!["male", "female", "others", "other"].includes(value.toLowerCase())) {
                    throw new Error("Gender data is not valid");
                }
            },
        },
        photoUrl: {
            type: String,
            default: "https://geographyandyou.com/images/user-profile.png",
            trim: true,
            validate(value) {
                if (!validator.isURL(value)) {
                    throw new Error("Invalid Photo URL: " + value);
                }
            },
        },
        about: {
            type: String,
            default: "This is a default about of the user!",
            trim: true,
            maxLength: [500, "About cannot exceed 500 characters"],
        },
        skills: {
            type: [String],
            validate(value) {
                if (value && value.length > 20) {
                    throw new Error("Cannot add more than 20 skills");
                }
            },
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", userSchema);
