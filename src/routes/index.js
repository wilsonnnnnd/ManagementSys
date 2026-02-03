const express = require("express");
const router = express.Router();

const usersRoutes = require("./users.routes");
const authRoutes = require("./auth.routes");

router.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);

module.exports = router;
