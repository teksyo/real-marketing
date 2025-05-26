import express, { Request, Response } from 'express';
import { register, login } from '../controllers/auth';

const router = express.Router(); // ✅ Correct way

router.post('/register', register);
router.post('/login', login);

export default router;