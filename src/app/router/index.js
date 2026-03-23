import { Router } from "express";

export const router = Router();
const moduleRoutes = [];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});
