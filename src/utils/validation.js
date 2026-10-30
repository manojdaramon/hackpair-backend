const validator = require("validator");

const validateSignUpData = (req) => {
    const { firstName, lastName, email, emailId, password, age, gender, photoUrl, skills } = req.body;

    const userEmail = email || emailId;

    if (!firstName || typeof firstName !== "string" || firstName.trim().length === 0) {
        throw new Error("First name is required");
    } else if (firstName.trim().length < 2 || firstName.trim().length > 50) {
        throw new Error("First name must be between 2 and 50 characters");
    }

    if (lastName && (typeof lastName !== "string" || lastName.trim().length > 50)) {
        throw new Error("Last name cannot exceed 50 characters");
    }

    if (!userEmail) {
        throw new Error("Email is required");
    } else if (!validator.isEmail(userEmail)) {
        throw new Error("Invalid email address: " + userEmail);
    }

    if (!password) {
        throw new Error("Password is required");
    } else if (!validator.isStrongPassword(password)) {
        throw new Error("Please enter a strong password (minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 symbol)");
    }

    if (age !== undefined) {
        const numAge = Number(age);
        if (Number.isNaN(numAge) || numAge < 18 || numAge > 120) {
            throw new Error("Age must be a valid number between 18 and 120");
        }
    }

    if (gender !== undefined && gender !== null) {
        const validGenders = ["male", "female", "others", "other"];
        if (typeof gender !== "string" || !validGenders.includes(gender.trim().toLowerCase())) {
            throw new Error("Gender must be one of: male, female, others");
        }
    }

    if (photoUrl && !validator.isURL(photoUrl)) {
        throw new Error("Invalid Photo URL: " + photoUrl);
    }

    if (skills !== undefined) {
        if (!Array.isArray(skills)) {
            throw new Error("Skills must be an array of strings");
        }
        if (skills.length > 20) {
            throw new Error("Skills cannot exceed 20 items");
        }
    }
};

const validateEditProfileData = (req) => {
    const ALLOWED_UPDATES = [
        "firstName",
        "lastName",
        "photoUrl",
        "about",
        "gender",
        "age",
        "skills"
    ];

    const fieldsToUpdate = Object.keys(req.body).filter(
        (field) => field !== "userId" && field !== "_id"
    );

    if (fieldsToUpdate.length === 0) {
        throw new Error("No fields provided to update");
    }

    const isUpdateAllowed = fieldsToUpdate.every((field) =>
        ALLOWED_UPDATES.includes(field)
    );

    if (!isUpdateAllowed) {
        const disallowedFields = fieldsToUpdate.filter(
            (field) => !ALLOWED_UPDATES.includes(field)
        );
        throw new Error("Update not allowed for field(s): " + disallowedFields.join(", "));
    }

    const { age, gender, photoUrl, skills, firstName, lastName } = req.body;

    if (firstName !== undefined) {
        if (typeof firstName !== "string" || firstName.trim().length < 2 || firstName.trim().length > 50) {
            throw new Error("First name must be between 2 and 50 characters");
        }
    }

    if (lastName !== undefined && lastName !== null) {
        if (typeof lastName !== "string" || lastName.trim().length > 50) {
            throw new Error("Last name cannot exceed 50 characters");
        }
    }

    if (age !== undefined) {
        const numAge = Number(age);
        if (Number.isNaN(numAge) || numAge < 18 || numAge > 120) {
            throw new Error("Age must be a valid number between 18 and 120");
        }
    }

    if (gender !== undefined && gender !== null) {
        const validGenders = ["male", "female", "others", "other"];
        if (typeof gender !== "string" || !validGenders.includes(gender.trim().toLowerCase())) {
            throw new Error("Gender must be one of: male, female, others");
        }
    }

    if (photoUrl !== undefined && photoUrl !== null && photoUrl !== "") {
        if (!validator.isURL(photoUrl)) {
            throw new Error("Invalid Photo URL: " + photoUrl);
        }
    }

    if (skills !== undefined) {
        if (!Array.isArray(skills)) {
            throw new Error("Skills must be an array of strings");
        }
        if (skills.length > 20) {
            throw new Error("Skills cannot exceed 20 items");
        }
    }

    return true;
};

module.exports = {
    validateSignUpData,
    validateEditProfileData,
};

