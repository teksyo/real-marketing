import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

export const register = async (req: Request, res: Response) => {
  const { email, password, region, role, phoneNumber } =
    req.body.newUser || req.body;
  // Check if email and password are provided
  if (!email || !password) {
    res.status(400).json({ message: "Missing required fields" });
    return;
  }
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    res.status(400).json({ message: "User already exists" });
    return;
  }
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      role,
      region: region || "US", // Default to "US" if region is undefined or falsy
      ...(phoneNumber && { phoneNumber }),
    },
  });
  res.json(user);
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, region: user.region },
    process.env.JWT_SECRET!,
    {
      expiresIn: "1d",
    }
  );

  res.json({ token });
};

export const getUserDetail = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.json({ user });
};
export const getAllUsers = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user && user.role !== "ADMIN") {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const users = await prisma.user.findMany();
  res.json({ users });
};

export const updateUser = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const userData = req.body;
  if (!user && user.role !== "ADMIN") {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { id } = req.params;
  const updatedUser = await prisma.user.update({
    where: {
      id: parseInt(id),
    },
    data: userData,
  });
  res.json({ updatedUser });
};
export const deleteUser = async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user || user.role !== "ADMIN") {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { id } = req.params;

  try {
    const deletedUser = await prisma.user.delete({
      where: {
        id: parseInt(id),
      },
    });

    res.json({ deletedUser });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
};
