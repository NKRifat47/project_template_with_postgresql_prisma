import { Router } from "express";
import { OtpRouter } from "../modules/otp/otp.route.js";

export const router = Router();
const moduleRoutes = [
  {
    path: "/otp",
    route: OtpRouter,
  },
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});
