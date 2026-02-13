const mailer = require('../utils/mailer');

exports.sendCustomEmail = async (req, res, next) => {
    try {
        const to = req.body && req.body.to;
        const subject = req.body && req.body.subject;
        const html = req.body && req.body.html;

        if (!to || !subject || !html) {
            const err = new Error('to, subject, and html are required');
            err.status = 400;
            throw err;
        }

        const ok = await mailer.sendEmail(to, subject, html);
        if (!ok) {
            const err = new Error('failed to send email');
            err.status = 502;
            throw err;
        }

        res.json({ sent: true });
    } catch (err) {
        next(err);
    }
};

module.exports = exports;
