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
        // create user
        const created = await UsersService.create({
            first_name,
            last_name,
            email,
            password,
        });
        // generate email verification token (15 minutes)
        const verifyToken = jwt.sign(
            { userId: created.id, type: "email_verification" },
            JWT_SECRET,
            { expiresIn: "15m" },
        );

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

        const updated = await UsersService.update(payload.userId, { status: "active" });
        if (updated && updated.password) delete updated.password;
        if (updated && updated.id) updated.id = encodeId(updated.id);

        res.json({ message: "email verified", user: updated });
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
