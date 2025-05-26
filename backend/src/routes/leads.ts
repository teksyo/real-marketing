import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// Get leads by region/state
router.get('/region/:region', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { region } = req.params;
  const user = (req as any).user;

  try {
    const leads = await prisma.lead.findMany({
      where: {
        region: region,
        createdById: user.id
      },
      include: {
        contacts: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(leads);
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// Get leads by zip code
router.get('/zip/:zip', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { zip } = req.params;
  const user = (req as any).user;

  try {
    const leads = await prisma.lead.findMany({
      where: {
        zipCode: zip,
        createdById: user.id
      },
      include: {
        contacts: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(leads);
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

export default router; 