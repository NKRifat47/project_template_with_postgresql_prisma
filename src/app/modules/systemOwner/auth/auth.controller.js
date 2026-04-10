import { StatusCodes } from "http-status-codes";
import { AuthService } from "./auth.service.js";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const handleError = (res, error) => {
  console.error("Auth Error:", error);
  if (error instanceof DevBuildError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }
  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "An internal server error occurred",
  });
};

const login = async (req, res) => {
  try {
    const result = await AuthService.login(prisma, req.body);
    const { refreshToken, accessToken, user } = result;

    // Store refresh token in httpOnly cookie (not accessible via JS)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Login successful",
      data: { user, accessToken },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const sendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;
    await AuthService.sendForgotPasswordOtp(prisma, email);
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "OTP sent to your email. It expires in 2 minutes.",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await AuthService.verifyForgotPasswordOtp(
      prisma,
      email,
      otp,
    );
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "OTP verified. Use the reset token to set a new password.",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    // Extract raw token (already verified by checkAuthMiddleware)
    const rawToken = req.headers.authorization.replace(/^Bearer\s*/i, "");
    await AuthService.resetPassword(prisma, req.user.id, rawToken, newPassword);
    return res.status(StatusCodes.OK).json({
      success: true,
      message:
        "Password reset successfully. Please login with your new password.",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await AuthService.changePassword(
      prisma,
      req.user.id,
      currentPassword,
      newPassword,
    );
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    const result = await AuthService.refreshAccessToken(prisma, refreshToken);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Access token refreshed successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const logout = async (req, res) => {
  try {
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const AuthController = {
  login,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  changePassword,
  refreshAccessToken,
  logout,
};
