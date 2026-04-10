import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import validateRequest from "../../../middleware/validateRequest.js";
import { AuthValidation } from "./auth.validation.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { rateLimit } from "../../../middleware/rateLimit.js";

const router = Router();

const loginLimiter = rateLimit({
  keyPrefix: "rl:systemOwner:login",
  windowSeconds: 60,
  max: 5,
  message: "Too many login attempts. Please try again later.",
  getKeySuffix: (req) => req.body?.email || req.ip,
});

const otpLimiter = rateLimit({
  keyPrefix: "rl:systemOwner:forgotPassword",
  windowSeconds: 120,
  max: 5,
  message: "Too many requests. Please try again later.",
  getKeySuffix: (req) => req.body?.email || req.ip,
});

router.post(
  "/login",
  loginLimiter,
  validateRequest(AuthValidation.loginSchema),
  AuthController.login,
);

router.post(
  "/forgot-password",
  otpLimiter,
  validateRequest(AuthValidation.forgotPasswordSchema),
  AuthController.sendForgotPasswordOtp,
);

router.post(
  "/verify-otp",
  otpLimiter,
  validateRequest(AuthValidation.verifyForgotPasswordOtpSchema),
  AuthController.verifyForgotPasswordOtp,
);

router.post(
  "/reset-password",
  checkAuthMiddleware("SYSTEM_OWNER"),
  validateRequest(AuthValidation.resetPasswordSchema),
  AuthController.resetPassword,
);

router.post(
  "/change-password",
  checkAuthMiddleware("SYSTEM_OWNER"),
  validateRequest(AuthValidation.changePasswordSchema),
  AuthController.changePassword,
);

router.post("/refresh-token", AuthController.refreshAccessToken);

router.post(
  "/logout",
  checkAuthMiddleware("SYSTEM_OWNER"),
  AuthController.logout,
);

export const AuthRouter = router;
