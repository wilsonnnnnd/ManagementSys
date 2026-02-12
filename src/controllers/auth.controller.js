const AuthService = require("../services/auth.service");
const UsersService = require("../services/users.service");

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

        // do not return password field
        if (result.user && result.user.password) delete result.user.password;
        res.json({
            accessToken: result.accessToken,
            user: result.user,
        });
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

        // perform login to create session and tokens
        const result = await AuthService.login(email, password);

        // set refresh token cookie
        res.cookie("refreshToken", result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: Number(process.env.REFRESH_TTL_HOURS || 24) * 60 * 60 * 1000,
        });

        // remove password before sending
        if (created && created.password) delete created.password;

        res.status(201).json({ accessToken: result.accessToken, user: created });
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
