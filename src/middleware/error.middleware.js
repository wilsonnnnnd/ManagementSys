module.exports = (err, req, res, next) => {
    // 打日志给自己看
    console.error(err);

    const status = err.status || 500;

    // If middleware provided a retryAfter (seconds), include header and body field
    if (err.retryAfter) {
        try {
            res.set('Retry-After', String(err.retryAfter));
        } catch (e) {
            // ignore if headers already sent or res.set not available
        }
    }

    const body = {
        error: err.message || "Internal Server Error",
    };
    if (err.retryAfter) body.retryAfter = err.retryAfter;

    res.status(status).json(body);
};
