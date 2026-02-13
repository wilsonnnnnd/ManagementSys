// Mailer: prefer Resend SDK when RESEND_API_KEY is set and SDK is installed,
// otherwise log to console.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@email.hdpoker.xyz';

let resendClient = null;
if (RESEND_API_KEY) {
    try {
        const { Resend } = require('resend');
        resendClient = new Resend(RESEND_API_KEY);
    } catch (err) {
        console.error('Resend SDK not available; falling back to console mailer', err);
        resendClient = null;
    }
}

async function sendViaResend(toEmail, link) {
    if (!resendClient) return false;
    try {
        const data = await resendClient.emails.send({
            from: EMAIL_FROM,
            to: [toEmail],
            subject: 'Please verify your email',
            html: `Please verify your email by clicking the link below:<br/><a href="${link}">${link}</a>`,
        });
        console.log('Resend email sent, response=', data);
        return true;
    } catch (err) {
        console.error('Resend send error:', err);
        return false;
    }
}

async function sendVerificationEmail(toEmail, link) {
    if (resendClient) {
        return await sendViaResend(toEmail, link);
    }

    // fallback: log to console
    console.log(`\n----- Verification Email (to: ${toEmail}) -----\nClick the link to verify your email:\n${link}\n-----------------------------------------------\n`);
    return true;
}

async function sendEmail(toEmail, subject, html) {
    if (resendClient) {
        try {
            const data = await resendClient.emails.send({
                from: EMAIL_FROM,
                to: [toEmail],
                subject,
                html,
            });
            console.log('Resend email sent, response=', data);
            return true;
        } catch (err) {
            console.error('Resend send error:', err);
            return false;
        }
    }

    // fallback: log to console
    console.log(`\n----- Email (to: ${toEmail}) -----\nSubject: ${subject}\n${html}\n-----------------------------------------------\n`);
    return true;
}

async function sendPasswordResetEmail(toEmail, link) {
    const subject = 'Password reset request';
    const html = `Please reset your password by clicking the link below:<br/><a href="${link}">${link}</a>`;
    return await sendEmail(toEmail, subject, html);
}

module.exports = { sendVerificationEmail, sendEmail, sendPasswordResetEmail };
