const AuthService = require("../services/auth.service");

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

        res.json({
            accessToken: result.accessToken,
            user: result.user,
        });
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
