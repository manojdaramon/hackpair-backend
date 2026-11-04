require("dotenv").config();
const { sendWelcomeEmail } = require("../services/emailService");

const testEmail = async () => {
    const recipient = process.argv[2];

    if (!recipient) {
        console.error("❌ Error: Recipient email is required.");
        console.log("👉 Usage: node src/utils/testEmail.js any-email@example.com");
        process.exit(1);
    }

    console.log(`🚀 Sending test HackPair email to '${recipient}'...`);

    const fakeUser = {
        firstName: "Test Developer",
        email: recipient,
    };

    const result = await sendWelcomeEmail(fakeUser);

    if (result && result.success) {
        console.log(`\n🎉 SUCCESS! Email dispatched via ${result.provider.toUpperCase()} to ${recipient}`);
        console.log(`Message ID: ${result.messageId}`);
    } else {
        console.error("\n❌ Email failed to send. Check the error log above.");
    }
};

testEmail();
