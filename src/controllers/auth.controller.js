const AuthService = require("../services/auth.service");

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        console.log('login req.body =', req.body);
        const result = await AuthService.login(email, password);
        res.json({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
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
        const token = req.body.refreshToken || tokenFromHeader;
        await AuthService.logout(token);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
};

exports.refresh = async (req, res, next) => {
    try {
        const token = req.body.refreshToken;
        const result = await AuthService.refresh(token);
        res.json(result);
    } catch (err) {
        next(err);
    }
};
