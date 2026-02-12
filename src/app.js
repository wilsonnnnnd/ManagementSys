const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const routes = require("./routes");
const authMiddleware = require("./middleware/auth.middleware");
const logMiddleware = require("./middleware/log.middleware");
const notFound = require("./middleware/notfound.middleware");
const errorHandler = require("./middleware/error.middleware");

const app = express();

// basic middleware
// allow credentials (cookies) and parse cookies
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// authentication (applies to all routes except /health and /auth/* inside middleware)
app.use(authMiddleware);

// request/response logging (uses req.user when available)
app.use(logMiddleware);

// routes
app.use("/", routes);

// 404
app.use(notFound);

// error handler (must be last)
app.use(errorHandler);

module.exports = app;
