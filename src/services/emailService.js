const nodemailer = require("nodemailer");
const { Resend } = require("resend");

// 1. Nodemailer Transporter (Gmail SMTP)
let nodemailerTransporter = null;

const getTransporter = () => {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, "") : null;

    if (!user || !pass) {
        return null;
    }

    if (!nodemailerTransporter) {
        nodemailerTransporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user,
                pass,
            },
        });
    }

    return nodemailerTransporter;
};

// 2. Resend Client (Alternative / Custom Domain)
let resendClient = null;

const getResendClient = () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey === "re_your_api_key_here") {
        return null;
    }
    if (!resendClient) {
        resendClient = new Resend(apiKey);
    }
    return resendClient;
};

const getSenderEmail = () => {
    return process.env.EMAIL_FROM || process.env.EMAIL_USER || "HackPair <onboarding@resend.dev>";
};

const getFrontendUrl = () => {
    return process.env.FRONTEND_URL || "http://localhost:5173";
};

/**
 * Universal dispatcher:
 * - Uses Gmail (Nodemailer) first if EMAIL_USER + EMAIL_PASS are set (can send to ANY email)
 * - Falls back to Resend if RESEND_API_KEY is available
 */
const dispatchEmail = async ({ to, subject, html }) => {
    const transporter = getTransporter();
    const from = getSenderEmail();

    if (transporter) {
        // Send via Gmail SMTP
        const info = await transporter.sendMail({
            from,
            to,
            subject,
            html,
        });
        console.log(`✉️ [EmailService:Gmail] Sent to ${to}. MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId, provider: "gmail" };
    }

    const resend = getResendClient();
    if (resend) {
        // Send via Resend
        const response = await resend.emails.send({
            from,
            to,
            subject,
            html,
        });
        if (response.error) {
            throw new Error(`Resend Error: ${response.error.message}`);
        }
        console.log(`✉️ [EmailService:Resend] Sent to ${to}. ID: ${response.data?.id}`);
        return { success: true, messageId: response.data?.id, provider: "resend" };
    }

    console.warn("⚠️ [EmailService] Neither Gmail (EMAIL_USER/EMAIL_PASS) nor Resend (RESEND_API_KEY) is configured.");
    return null;
};

/**
 * Common HTML wrapper for consistent, professional styling across all emails
 */
const wrapEmailTemplate = ({ title, preheader, contentHtml }) => {
    const frontendUrl = getFrontendUrl();
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
    <div style="display: none; max-height: 0px; overflow: hidden; opacity: 0;">
        ${preheader || title}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f5f7; padding: 32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 28px 32px; text-align: left;">
                            <span style="color: #6366f1; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">&lt;/&gt;</span>
                            <span style="color: #ffffff; font-size: 22px; font-weight: 700; margin-left: 8px; letter-spacing: -0.5px;">HackPair</span>
                            <p style="color: #c7d2fe; font-size: 13px; margin: 4px 0 0 0;">Developers meet developers</p>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 32px; font-size: 15px; line-height: 1.6; color: #374151;">
                            ${contentHtml}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; border-top: 1px solid #f3f4f6; padding: 20px 32px; text-align: center; font-size: 12px; color: #9ca3af;">
                            <p style="margin: 0 0 8px 0;">You received this email because you have an account on <a href="${frontendUrl}" style="color: #4f46e5; text-decoration: none;">HackPair</a>.</p>
                            <p style="margin: 0;">&copy; ${new Date().getFullYear()} HackPair. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
};

/**
 * Send Welcome Email upon registration
 */
const sendWelcomeEmail = async (user) => {
    try {
        const frontendUrl = getFrontendUrl();
        const firstName = user.firstName || "Developer";

        const contentHtml = `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">Welcome to HackPair, ${firstName}! 👋</h2>
            <p>We're thrilled to have you here. HackPair connects ambitious developers, designers, and builders to pair up for hackathons and exciting side projects.</p>
            
            <div style="background-color: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 0 0 8px 0; font-weight: 600; color: #4338ca;">Here is how to get started:</p>
                <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                    <li style="margin-bottom: 6px;">Complete your developer profile and add your top skills.</li>
                    <li style="margin-bottom: 6px;">Explore fellow developers in the feed and hit <strong>Interested</strong>.</li>
                    <li>Start building something awesome together!</li>
                </ul>
            </div>

            <div style="text-align: center; margin: 32px 0 16px 0;">
                <a href="${frontendUrl}" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
                    Explore HackPair Now &rarr;
                </a>
            </div>
        `;

        const html = wrapEmailTemplate({
            title: `Welcome to HackPair, ${firstName}!`,
            preheader: `Get ready to find your next hackathon teammate on HackPair.`,
            contentHtml,
        });

        return await dispatchEmail({
            to: user.email,
            subject: `Welcome to HackPair, ${firstName}! 🚀`,
            html,
        });
    } catch (error) {
        console.error(`❌ [EmailService] Failed to send welcome email to ${user?.email}:`, error.message);
        return null;
    }
};

/**
 * Send Notification when a user receives a new Connection Request
 */
const sendConnectionRequestEmail = async ({ recipient, sender }) => {
    try {
        const frontendUrl = getFrontendUrl();
        const recipientName = recipient.firstName || "Developer";
        const senderName = `${sender.firstName} ${sender.lastName || ""}`.trim();
        const senderSkills = Array.isArray(sender.skills) && sender.skills.length > 0 
            ? sender.skills.slice(0, 5).join(", ") 
            : null;

        const contentHtml = `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">New Connection Request! 🤝</h2>
            <p><strong>${senderName}</strong> is interested in teaming up with you on HackPair.</p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <div style="font-weight: 700; color: #0f172a; font-size: 16px; margin-bottom: 6px;">${senderName}</div>
                ${sender.about ? `<p style="color: #475569; font-size: 14px; margin: 0 0 12px 0; font-style: italic;">"${sender.about}"</p>` : ""}
                ${senderSkills ? `
                    <div style="font-size: 13px; color: #64748b;">
                        <strong>Skills:</strong> <span style="color: #334155;">${senderSkills}</span>
                    </div>
                ` : ""}
            </div>

            <p style="color: #4b5563;">Review their request and accept if you'd like to collaborate:</p>

            <div style="text-align: center; margin: 28px 0 16px 0;">
                <a href="${frontendUrl}/requests" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
                    View &amp; Review Request &rarr;
                </a>
            </div>
        `;

        const html = wrapEmailTemplate({
            title: `New Connection Request from ${senderName}`,
            preheader: `${senderName} wants to connect with you on HackPair.`,
            contentHtml,
        });

        return await dispatchEmail({
            to: recipient.email,
            subject: `🤝 ${senderName} sent you a connection request on HackPair!`,
            html,
        });
    } catch (error) {
        console.error(`❌ [EmailService] Failed to send connection request email to ${recipient?.email}:`, error.message);
        return null;
    }
};

/**
 * Send Notification when a connection request is accepted
 */
const sendConnectionAcceptedEmail = async ({ recipient, accepter }) => {
    try {
        const frontendUrl = getFrontendUrl();
        const recipientName = recipient.firstName || "Developer";
        const accepterName = `${accepter.firstName} ${accepter.lastName || ""}`.trim();

        const contentHtml = `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">Connection Request Accepted! 🎉</h2>
            <p>Great news, ${recipientName}! <strong>${accepterName}</strong> has accepted your connection request.</p>

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 0; color: #166534; font-weight: 500;">
                    You are now connected! You can view their full profile in your connections list and reach out to team up for your next hackathon.
                </p>
            </div>

            <div style="text-align: center; margin: 28px 0 16px 0;">
                <a href="${frontendUrl}/connections" style="background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
                    View Your Connections &rarr;
                </a>
            </div>
        `;

        const html = wrapEmailTemplate({
            title: `Connection Accepted by ${accepterName}`,
            preheader: `${accepterName} accepted your connection request on HackPair.`,
            contentHtml,
        });

        return await dispatchEmail({
            to: recipient.email,
            subject: `🎉 ${accepterName} accepted your connection request on HackPair!`,
            html,
        });
    } catch (error) {
        console.error(`❌ [EmailService] Failed to send connection accepted email to ${recipient?.email}:`, error.message);
        return null;
    }
};

/**
 * Send Password Reset Link Email
 */
const sendPasswordResetEmail = async ({ user, resetUrl }) => {
    try {
        const firstName = user.firstName || "Developer";

        const contentHtml = `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">Password Reset Request 🔐</h2>
            <p>Hi ${firstName},</p>
            <p>We received a request to reset the password for your HackPair account.</p>
            <p>Click the button below to reset your password. This link is valid for <strong>15 minutes</strong>:</p>

            <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
                    Reset Your Password &rarr;
                </a>
            </div>

            <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
                If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
        `;

        const html = wrapEmailTemplate({
            title: "Reset Your HackPair Password",
            preheader: "Reset instructions for your HackPair account.",
            contentHtml,
        });

        return await dispatchEmail({
            to: user.email,
            subject: "🔐 Reset Your HackPair Password",
            html,
        });
    } catch (error) {
        console.error(`❌ [EmailService] Failed to send password reset email to ${user?.email}:`, error.message);
        return null;
    }
};

module.exports = {
    sendWelcomeEmail,
    sendConnectionRequestEmail,
    sendConnectionAcceptedEmail,
    sendPasswordResetEmail,
};
