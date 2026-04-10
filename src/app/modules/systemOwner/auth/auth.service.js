import { StatusCodes } from "http-status-codes";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import DevBuildError from "../../../lib/DevBuildError.js";
import { createUserTokens } from "../../../utils/userTokenGenerator.js";
import { redisClient } from "../../../config/redis.config.js";
import { sendEmail } from "../../../utils/sendEmail.js";
import { envVars } from "../../../config/env.js";

const login = async (prisma, payload) => {
  const { email, password } = payload;

  const user = await prisma.users.findUnique({
    where: { email },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  if (user.role !== "SYSTEM_OWNER") {
    throw new DevBuildError("You are not authorized", StatusCodes.UNAUTHORIZED);
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);

  if (!isPasswordMatch) {
    throw new DevBuildError("Incorrect password", StatusCodes.UNAUTHORIZED);
  }

  const tokens = createUserTokens(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      avatar: user.avatar,
    },
    ...tokens,
  };
};

const OTP_EXPIRATION = 2 * 60; // 2 minutes
const REDIS_KEY_PREFIX = "system-owner-forgot-password";

const generateOtp = () => crypto.randomInt(100000, 999999).toString();

const sendForgotPasswordOtp = async (prisma, email) => {
  const user = await prisma.users.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      is_verified: true,
      first_name: true,
      last_name: true,
    },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  if (user.role !== "SYSTEM_OWNER") {
    throw new DevBuildError("You are not authorized", StatusCodes.UNAUTHORIZED);
  }

  if (!user.is_verified) {
    throw new DevBuildError("Account is not verified", StatusCodes.FORBIDDEN);
  }

  const otp = generateOtp();
  const redisKey = `${REDIS_KEY_PREFIX}:${email}`;

  await redisClient.set(redisKey, otp, { EX: OTP_EXPIRATION });

  await sendEmail({
    to: email,
    subject: "Forgot Password OTP",
    templateName: "forgotPassword",
    templateData: {
      name: `${user.first_name} ${user.last_name}`,
      otp,
    },
  });
};

const RESET_TOKEN_EXPIRATION = 2 * 60; // 2 minutes
const RESET_TOKEN_KEY_PREFIX = "system-owner-reset-token";

const verifyForgotPasswordOtp = async (prisma, email, otp) => {
  const redisKey = `${REDIS_KEY_PREFIX}:${email}`;
  const savedOtp = await redisClient.get(redisKey);

  if (!savedOtp) {
    throw new DevBuildError("OTP has expired", StatusCodes.UNAUTHORIZED);
  }

  if (savedOtp !== otp) {
    throw new DevBuildError("Invalid OTP", StatusCodes.UNAUTHORIZED);
  }

  const user = await prisma.users.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  // OTP verified — delete it (one-time use)
  await redisClient.del(redisKey);

  // Generate short-lived reset token (2 min)
  const resetToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    envVars.JWT_SECRET_TOKEN,
    { expiresIn: "2m" },
  );

  // Store token in Redis with same 2-min TTL
  // → invalidated immediately on use, OR auto-expired if unused
  const resetRedisKey = `${RESET_TOKEN_KEY_PREFIX}:${user.id}`;
  await redisClient.set(resetRedisKey, resetToken, {
    EX: RESET_TOKEN_EXPIRATION,
  });

  return { resetToken };
};

const resetPassword = async (prisma, userId, resetToken, newPassword) => {
  // Check Redis — token must still exist (not used, not expired)
  const resetRedisKey = `${RESET_TOKEN_KEY_PREFIX}:${userId}`;
  const storedToken = await redisClient.get(resetRedisKey);

  if (!storedToken) {
    throw new DevBuildError(
      "Reset token has already been used or has expired",
      StatusCodes.UNAUTHORIZED,
    );
  }

  if (storedToken !== resetToken) {
    throw new DevBuildError("Invalid reset token", StatusCodes.UNAUTHORIZED);
  }

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  if (user.role !== "SYSTEM_OWNER") {
    throw new DevBuildError("You are not authorized", StatusCodes.UNAUTHORIZED);
  }

  // Invalidate token immediately (one-time use)
  await redisClient.del(resetRedisKey);

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.users.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });
};

const changePassword = async (prisma, userId, currentPassword, newPassword) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, role: true, password: true },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  if (user.role !== "SYSTEM_OWNER") {
    throw new DevBuildError("You are not authorized", StatusCodes.UNAUTHORIZED);
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new DevBuildError(
      "Current password is incorrect",
      StatusCodes.UNAUTHORIZED,
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.users.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });
};

const refreshAccessToken = async (prisma, token) => {
  if (!token) {
    throw new DevBuildError(
      "No refresh token provided. Please login again.",
      StatusCodes.UNAUTHORIZED,
    );
  }

  let decoded;
  try {
    decoded = jwt.verify(token, envVars.JWT_REFRESH_TOKEN);
  } catch {
    throw new DevBuildError(
      "Refresh token is invalid or expired. Please login again.",
      StatusCodes.UNAUTHORIZED,
    );
  }

  const user = await prisma.users.findUnique({
    where: { id: decoded.id },
    select: { id: true, email: true, role: true, is_verified: true },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  if (user.role !== "SYSTEM_OWNER") {
    throw new DevBuildError("You are not authorized", StatusCodes.UNAUTHORIZED);
  }

  // Generate a fresh access token
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    envVars.JWT_SECRET_TOKEN,
    { expiresIn: envVars.JWT_EXPIRES_IN },
  );

  return { accessToken };
};

export const AuthService = {
  login,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  changePassword,
  refreshAccessToken,
};
