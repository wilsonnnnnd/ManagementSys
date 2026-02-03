// requireRole: middleware factory that checks req.user.role
function requireRole(role) {
    return function (req, res, next) {
        try {
            if (!req.user) {
                const err = new Error("Authentication required");
                err.status = 401;
                throw err;
            }
            if (req.user.role !== role) {
                const err = new Error("Forbidden");
                err.status = 403;
                throw err;
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

function requireRoleOrOwner(role) {
    return function (req, res, next) {
        try {
            if (!req.user) {
                const err = new Error("Authentication required");
                err.status = 401;
                throw err;
            }

            const targetId = Number(req.params.id);
            if (req.user.role === role || req.user.id === targetId) {
                return next();
            }

            const err = new Error("Forbidden");
            err.status = 403;
            throw err;
        } catch (err) {
            next(err);
        }
    };
}

module.exports = { requireRole, requireRoleOrOwner };
