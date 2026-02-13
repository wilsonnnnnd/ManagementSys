const AuthService = require("../services/auth.service");
const UsersService = require("../services/users.service");
const { encodeId } = require("../utils/idCipher");
const jwt = require("jsonwebtoken");
const mailer = require("../utils/mailer");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("Environment variable JWT_SECRET is required");
}

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        console.log('login req.body =', req.body);
        const result = await AuthService.login(email, password);
        // set refresh token as HttpOnly cookie and return accessToken + user
        res.cookie("refreshToken", result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: Number(process.env.REFRESH_TTL_HOURS || 24) * 60 * 60 * 1000,
        });

        // do not return password field and encode id for response
        let respUser = null;
        if (result.user) {
            const userCopy = { ...result.user };
            if (userCopy.password) delete userCopy.password;
            if (userCopy.id) userCopy.id = encodeId(userCopy.id);
            respUser = userCopy;
        }
        res.json({ accessToken: result.accessToken, user: respUser });
    } catch (err) {
        next(err);
    }
};

exports.register = async (req, res, next) => {
    try {
        const { first_name, last_name, email, password } = req.body;
        // create user and persist verification token + expiry
        const { user: created, verifyToken, verifyExpiresAt } = await UsersService.createWithVerification({
            first_name,
            last_name,
            email,
            password,
            expiresMinutes: 15,
        });

        const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const verifyLink = `${base}/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;

        // send verification email (await result)
        await mailer.sendVerificationEmail(created.email, verifyLink);

        // remove password before sending and return created user (with encoded id)
        if (created && created.password) delete created.password;
        const respCreated = created && created.id ? { ...created, id: encodeId(created.id) } : created;
        res.status(201).json({ message: "registered; verification email sent", user: respCreated });
    } catch (err) {
        next(err);
    }
};

exports.verifyEmail = async (req, res, next) => {
    try {
        const token = req.query.token || (req.body && req.body.token);
        if (!token) {
            const err = new Error("token required");
            err.status = 400;
            throw err;
        }

        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            const e = new Error("Invalid or expired token");
            e.status = 400;
            throw e;
        }

        if (payload.type !== "email_verification" || !payload.userId) {
            const e = new Error("Invalid token");
            e.status = 400;
            throw e;
        }

        // ensure token matches the one stored on the user and hasn't expired
        const user = await UsersService.getById(payload.userId);
        if (!user) {
            const e = new Error('User not found');
            e.status = 404;
            throw e;
        }

        if (!user.verify_token || user.verify_token !== token) {
            const e = new Error('Invalid or mismatched token');
            e.status = 400;
            throw e;
        }

        if (!user.verify_expires_at || new Date(user.verify_expires_at) < new Date()) {
            const e = new Error('Token expired');
            e.status = 400;
            throw e;
        }

        const updated = await UsersService.update(payload.userId, { status: "active", verify_token: null, verify_expires_at: null });
        if (updated && updated.password) delete updated.password;
        if (updated && updated.id) updated.id = encodeId(updated.id);

        res.json({ message: "email verified", user: updated });
    } catch (err) {
        next(err);
    }
};

exports.forgotPassword = async (req, res, next) => {
    try {
        const email = req.body && req.body.email;
        if (!email) {
            const err = new Error('email required');
            err.status = 400;
            throw err;
        }

        // generate reset token if user exists (service returns null otherwise)
        const token = await UsersService.generateResetToken(email, 60);

        // build link and send email only if token was generated
        if (token) {
            const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
            const resetLink = `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;
            await mailer.sendPasswordResetEmail(email, resetLink);
        }

        // Always return 200 to avoid disclosing account existence
        res.json({ message: 'If an account exists, a reset link has been sent' });
    } catch (err) {
        next(err);
    }
};

exports.resetPassword = async (req, res, next) => {
    try {
        const token = req.body && req.body.token;
        const password = req.body && req.body.password;
        if (!token || !password) {
            const err = new Error('token and password required');
            err.status = 400;
            throw err;
        }

        const updated = await UsersService.resetPasswordByToken(token, password);

        if (updated && updated.password) delete updated.password;
        if (updated && updated.id) updated.id = encodeId(updated.id);

        res.json({ message: 'password reset', user: updated });
    } catch (err) {
        next(err);
    }
};

exports.sendTestEmail = async (req, res, next) => {
    try {
        const toEmail = req.body && req.body.email;
        if (!toEmail) {
            const err = new Error('email required');
            err.status = 400;
            throw err;
        }

        const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const testLink = `${base}/`; // simple test link

        const ok = await mailer.sendVerificationEmail(toEmail, testLink);
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

exports.logout = async (req, res, next) => {
    try {
        const tokenFromHeader = (req.headers.authorization || "").startsWith(
            "Bearer ",
        )
            ? req.headers.authorization.slice(7)
            : null;
        const token = (req.body && req.body.refreshToken) || req.cookies?.refreshToken || tokenFromHeader;
        await AuthService.logout(token);
        // clear cookie
        res.clearCookie("refreshToken", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
        res.status(204).send();
    } catch (err) {
        next(err);
    }
};

exports.refresh = async (req, res, next) => {
    try {
        const token = (req.body && req.body.refreshToken) || req.cookies?.refreshToken;
        const result = await AuthService.refresh(token);
        // attach user to request so log.middleware can record user_id for this /auth/refresh request
        if (result.user) req.user = result.user;
        // rotate cookie to the new refresh token returned by service
        if (result.refreshToken) {
            res.cookie("refreshToken", result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: Number(process.env.REFRESH_TTL_HOURS || 24) * 60 * 60 * 1000,
            });
        }
        // return access token only
        res.json({ accessToken: result.accessToken });
    } catch (err) {
        next(err);
    }
};
