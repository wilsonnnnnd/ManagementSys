const { decodeId } = require('../utils/idCipher');

// Middleware to decode encrypted id in req.params.id and replace with numeric id
function decodeIdParam(req, res, next) {
    const raw = req.params && req.params.id;
    if (!raw) return next();

    // if it's already an integer string, leave it
    if (/^\d+$/.test(raw)) return next();

    const decoded = decodeId(raw);
    if (decoded === null || Number.isNaN(decoded)) {
        const err = new Error('Invalid id');
        err.status = 400;
        return next(err);
    }

    // replace param with numeric id string so validators/services see integer
    req.params.id = String(decoded);
    next();
}

module.exports = { decodeIdParam };
