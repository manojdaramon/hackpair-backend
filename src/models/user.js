const mongoose = require("mongoose");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const JWT_SECRET = process.env.JWT_SECRET || "DEV@HackPair$790";

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
                if (!validator.isURL(value) && !value.startsWith("data:image/")) {
                    throw new Error("Invalid Photo URL: " + value);
                }
            },
        },
        about: {
            type: String,
            default: "Passionate developer looking to team up for upcoming hackathons.",
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
        resetPasswordToken: {
            type: String,
        },
        resetPasswordExpires: {
            type: Date,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: function (doc, ret) {
                delete ret.password;
                delete ret.resetPasswordToken;
                delete ret.resetPasswordExpires;
                delete ret.__v;
                return ret;
            },
        },
        toObject: {
            transform: function (doc, ret) {
                delete ret.password;
                delete ret.resetPasswordToken;
                delete ret.resetPasswordExpires;
                delete ret.__v;
                return ret;
            },
        },
    }
);

userSchema.methods.getJWT = async function () {
    const user = this;
    const token = await jwt.sign({ _id: user._id }, JWT_SECRET, {
        expiresIn: "7d",
    });
    return token;
};

userSchema.methods.validatePassword = async function (passwordInputByUser) {
    const user = this;
    const passwordHash = user.password;
    const isPasswordValid = await bcrypt.compare(passwordInputByUser, passwordHash);
    return isPasswordValid;
};

module.exports = mongoose.model("User", userSchema);
