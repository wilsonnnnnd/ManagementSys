const express = require("express");
const router = express.Router();

const AuthController = require("../controllers/auth.controller");
const { body } = require("express-validator");
const handleValidation = require("../middleware/validation.middleware");

router.post(
    "/login",
    body("email").isEmail().withMessage("invalid email"),
    body("password")
        .isLength({ min: 6 })
        .withMessage("password must be at least 6 characters"),
    handleValidation,
    AuthController.login,
);

router.post(
    "/refresh",
    body("refreshToken").isString().withMessage("refreshToken required"),
    handleValidation,
    AuthController.refresh,
);

router.post(
    "/logout",
    body("refreshToken").optional().isString(),
    handleValidation,
    AuthController.logout,
);

module.exports = router;
