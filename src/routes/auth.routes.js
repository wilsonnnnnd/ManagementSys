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
    // refresh token can be provided in cookie or in body; validation is handled in controller/service
    AuthController.refresh,
);

router.post(
    "/logout",
    // accept refresh token via cookie/body/header; validation in controller/service
    AuthController.logout,
);

module.exports = router;
