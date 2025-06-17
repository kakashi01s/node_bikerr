import nodemailer from "nodemailer";
import { ApiResponse } from "./apiResponse.js";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true', // Use `true` if port is 465
    service: process.env.SMTP_SERVICE,
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
    },
});

const sendEmail = async (to, subject, body) => {
    try {
        const mailOptions = {
            from: process.env.SMTP_FROM_EMAIL,
            to: to,
            subject: subject,
            html: body, // Consider using HTML for better formatting
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.messageId);
        return { success: true };
    } catch (error) {
        console.error("Error sending email:", error);
        return { success: false, error: error.message };
    }
};

const sendmail = async (_, __, res, email, subject, body) => {
    console.warn("sendmail function is deprecated. Use sendEmail directly.");
    const result = await sendEmail(email, subject, body);
    if (!result.success) {
        return res.status(500).json(new ApiResponse(500, {}, "Failed to send email: " + result.error));
    }
    return { success: true };
};

export { sendmail, sendEmail };