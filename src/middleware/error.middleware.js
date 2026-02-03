module.exports = (err, req, res, next) => {
    // 打日志给自己看
    console.error(err);

    const status = err.status || 500;
    res.status(status).json({
        error: err.message || "Internal Server Error",
    });
};
