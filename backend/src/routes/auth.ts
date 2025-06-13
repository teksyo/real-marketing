import express, { Request, Response } from "express";
import {
  register,
  login,
  getUserDetail,
  getAllUsers,
  updateUser,
  deleteUser,
} from "../controllers/auth";
import { authMiddleware } from "../middleware/auth";

const router = express.Router(); // ✅ Correct way

router.post("/register", register);
router.post("/login", login);
router.get("/users/me", authMiddleware, getUserDetail);
router.get("/users", authMiddleware, getAllUsers);
router.put("/users/:id", authMiddleware, updateUser);
router.delete("/users/:id", authMiddleware, deleteUser);

export default router;
