import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// Get all appointments for the authenticated user
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;

  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        createdById: user.id
      },
      include: {
        lead: {
          select: {
            id: true,
            address: true,
            zipCode: true,
            region: true
          }
        }
      },
      orderBy: {
        datetime: 'asc'
      }
    });

    res.json(appointments);
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Get appointment by ID
router.get('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: parseInt(id),
        createdById: user.id
      },
      include: {
        lead: {
          select: {
            id: true,
            address: true,
            zipCode: true,
            region: true
          }
        }
      }
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    res.json(appointment);
  } catch (err) {
    console.error('Error fetching appointment:', err);
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

// Create new appointment
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { title, description, datetime, location, status, notes, leadId } = req.body;
  const user = (req as any).user;

  try {
    // Validate required fields
    if (!title || !datetime) {
      res.status(400).json({ error: 'Title and datetime are required' });
      return;
    }

    // Validate leadId if provided
    if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: {
          id: leadId,
          createdById: user.id
        }
      });

      if (!lead) {
        res.status(400).json({ error: 'Lead not found or not accessible' });
        return;
      }
    }

    const appointment = await prisma.appointment.create({
      data: {
        title,
        description,
        datetime: new Date(datetime),
        location,
        status: status || 'SCHEDULED',
        notes,
        leadId: leadId || null,
        createdById: user.id
      },
      include: {
        lead: {
          select: {
            id: true,
            address: true,
            zipCode: true,
            region: true
          }
        }
      }
    });

    res.status(201).json(appointment);
  } catch (err) {
    console.error('Error creating appointment:', err);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Update appointment
router.put('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { title, description, datetime, location, status, notes, leadId } = req.body;
  const user = (req as any).user;

  try {
    // Check if appointment exists and belongs to user
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        id: parseInt(id),
        createdById: user.id
      }
    });

    if (!existingAppointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    // Validate leadId if provided
    if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: {
          id: leadId,
          createdById: user.id
        }
      });

      if (!lead) {
        res.status(400).json({ error: 'Lead not found or not accessible' });
        return;
      }
    }

    const appointment = await prisma.appointment.update({
      where: {
        id: parseInt(id)
      },
      data: {
        title,
        description,
        datetime: datetime ? new Date(datetime) : undefined,
        location,
        status,
        notes,
        leadId: leadId || null
      },
      include: {
        lead: {
          select: {
            id: true,
            address: true,
            zipCode: true,
            region: true
          }
        }
      }
    });

    res.json(appointment);
  } catch (err) {
    console.error('Error updating appointment:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Delete appointment
router.delete('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    // Check if appointment exists and belongs to user
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        id: parseInt(id),
        createdById: user.id
      }
    });

    if (!existingAppointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    await prisma.appointment.delete({
      where: {
        id: parseInt(id)
      }
    });

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting appointment:', err);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

// Get appointments by status
router.get('/status/:status', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { status } = req.params;
  const user = (req as any).user;

  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        status: status.toUpperCase() as any,
        createdById: user.id
      },
      include: {
        lead: {
          select: {
            id: true,
            address: true,
            zipCode: true,
            region: true
          }
        }
      },
      orderBy: {
        datetime: 'asc'
      }
    });

    res.json(appointments);
  } catch (err) {
    console.error('Error fetching appointments by status:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

export default router; 