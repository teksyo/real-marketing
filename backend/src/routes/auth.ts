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
router.get("/user-detail", authMiddleware, getUserDetail);
router.get("/users", authMiddleware, getAllUsers);
router.put("/user-update/:id", authMiddleware, updateUser);
router.delete("/user-delete/:id", authMiddleware, deleteUser);

export default router;
