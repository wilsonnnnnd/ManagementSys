const express = require("express");
const router = express.Router();

const AuthController = require("../controllers/auth.controller");
const { body } = require("express-validator");
const handleValidation = require("../middleware/validation.middleware");
const { forgotPasswordRateLimiter } = require('../middleware/rateLimit.middleware');

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
    "/register",
    body("email").isEmail().withMessage("invalid email"),
    body("password").isLength({ min: 6 }).withMessage("password must be at least 6 characters"),
    body("first_name").optional().isString(),
    body("last_name").optional().isString(),
    handleValidation,
    AuthController.register,
);

router.get(
    "/verify-email",
    AuthController.verifyEmail,
);

router.post(
    "/forgot-password",
    body('email').isEmail().withMessage('invalid email'),
    handleValidation,
    forgotPasswordRateLimiter,
    AuthController.forgotPassword,
);

router.post(
    "/reset-password",
    body('token').isString().notEmpty().withMessage('token required'),
    body('password').isLength({ min: 6 }).withMessage('password must be at least 6 characters'),
    handleValidation,
    AuthController.resetPassword,
);

router.post(
    "/refresh",
    // refresh token can be provided in cookie or in body; validation is handled in controller/service
    AuthController.refresh,
);

router.post(
    "/logout",
    // accept refresh token via cookie/body/header; validation in controller/service
    AuthController.logout,
);

router.post(
    "/test-email",
    body("email").isEmail().withMessage("invalid email"),
    handleValidation,
    AuthController.sendTestEmail,
);

router.post(
    "/send-email",
    body("to").isEmail().withMessage("invalid to email"),
    body("subject").isString().notEmpty().withMessage("subject required"),
    body("html").isString().notEmpty().withMessage("html required"),
    handleValidation,
    AuthController.sendCustomEmail,
);

module.exports = router;
