const AuthService = require("../services/auth.service");

module.exports = async function authMiddleware(req, res, next) {
    // Allow unauthenticated access to health and auth endpoints
    if (req.path === "/health" || req.path.startsWith("/auth")) {
        return next();
    }

    try {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : header;
        if (!token) {
            const err = new Error("Authentication required");
            err.status = 401;
            throw err;
        }

        const { user } = await AuthService.verifySession(token);
        // attach user to request for handlers
        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
};
