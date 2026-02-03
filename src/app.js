const express = require("express");
const cors = require("cors");

const routes = require("./routes");
const authMiddleware = require("./middleware/auth.middleware");
const notFound = require("./middleware/notfound.middleware");
const errorHandler = require("./middleware/error.middleware");

const app = express();

// basic middleware
app.use(cors());
app.use(express.json());

// authentication (applies to all routes except /health and /auth/* inside middleware)
app.use(authMiddleware);

// routes
app.use("/", routes);

// 404
app.use(notFound);

// error handler (must be last)
app.use(errorHandler);

module.exports = app;
