import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Helper function to log lead activity
const logActivity = async (leadId: number, userId: number, type: string, description: string, metadata?: any) => {
  try {
    await prisma.leadActivity.create({
      data: {
        leadId,
        userId,
        type: type as any,
        description,
        metadata: metadata || null,
      },
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

// GET /api/leads - Get all leads with filtering and pagination
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const { 
      status, 
      priority, 
      source, 
      region, 
      search, 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Base filter: show scraped leads to all users, manual leads only to creators
    let where: any = {
      OR: [
        { source: 'ZILLOW' }, // Show all Zillow scraped leads to everyone
        { createdById: user.id } // Show user's own manually created leads
      ]
    };

    // If filtering by specific source, adjust the logic
    if (source) {
      if (source === 'ZILLOW') {
        where = { source: 'ZILLOW' };
      } else {
        where = { 
          source: source,
          createdById: user.id 
        };
      }
    }

    // Apply other filters
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (region) where.region = region;
    
    // Add search functionality
    if (search) {
      const searchConditions = [
        { address: { contains: search, mode: 'insensitive' } },
        { zipCode: { contains: search } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];

      if (where.OR) {
        // If we have OR conditions (base case), combine with search
        where = {
          AND: [
            { OR: where.OR },
            { OR: searchConditions }
          ]
        };
      } else {
        // If we have specific filters, just add search
        const existingConditions = { ...where };
        where = {
          AND: [
            existingConditions,
            { OR: searchConditions }
          ]
        };
      }
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        select: {
          id: true,
          address: true,
          zipCode: true,
          price: true,
          beds: true,
          status: true,
          priority: true,
          source: true,
          lastContactDate: true,
          createdAt: true,
          // Only get the first contact's phone number
          contacts: {
            select: {
              phoneNumber: true
            },
            take: 1
          },
          // Only get counts for action indicators
          _count: {
            select: {
              smsConversations: true
            }
          }
        },
        orderBy: { [sortBy as string]: sortOrder },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.lead.count({ where }),
    ]);

    // Transform the data to match the expected frontend format
    const transformedLeads = leads.map(lead => ({
      ...lead,
      contacts: lead.contacts, // Keep contacts array for compatibility
      smsConversations: Array(lead._count.smsConversations).fill({}) // Create array with count for length check
    }));

    res.json({
      leads: transformedLeads,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// GET /api/leads/:id - Get specific lead with full details
router.get('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const leadId = parseInt(req.params.id);
    
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        OR: [
          { source: 'ZILLOW' }, // Allow all users to view Zillow scraped leads
          { createdById: user.id } // Allow users to view their own manually created leads
        ]
      },
      include: {
        contacts: true,
        appointments: {
          orderBy: { datetime: 'desc' },
        },
        leadActivities: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { email: true },
            },
          },
        },
        smsConversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        createdBy: {
          select: { email: true },
        },
      },
    });

    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    res.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// POST /api/leads - Create new lead manually
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const {
      address,
      price,
      beds,
      zipCode,
      phoneNumber,
      priority = 'MEDIUM',
      source = 'MANUAL',
      notes,
      nextFollowUpDate,
    } = req.body;

    if (!zipCode) {
      res.status(400).json({ error: 'ZIP code is required' });
      return;
    }

    const lead = await prisma.lead.create({
      data: {
        address,
        price,
        beds,
        zipCode,
        priority,
        source,
        notes,
        nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
        region: user.region,
        createdById: user.id,
      },
    });

    // If phone number is provided, create a contact record
    if (phoneNumber && phoneNumber.trim()) {
      const contact = await prisma.contact.create({
        data: {
          phoneNumber: phoneNumber.trim(),
          type: 'AGENT', // Default type for manually added contacts
          name: null, // Can be updated later
          company: null,
          leads: {
            connect: { id: lead.id }
          }
        },
      });
    }

    // Fetch the lead with all related data for response
    const leadWithContacts = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: {
        contacts: true,
        leadActivities: true,
      },
    });

    // Log lead creation activity
    await logActivity(
      lead.id,
      user.id,
      'LEAD_CREATED',
      `Lead created manually for ${address || zipCode}${phoneNumber ? ` with phone ${phoneNumber}` : ''}`,
      { source: 'MANUAL', phoneNumber: phoneNumber || null }
    );

    res.status(201).json(leadWithContacts);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// PUT /api/leads/:id - Update lead
router.put('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const leadId = parseInt(req.params.id);
    const {
      address,
      price,
      beds,
      zipCode,
      phoneNumber,
      priority,
      source,
      notes,
      nextFollowUpDate,
    } = req.body;

    // Check if lead belongs to user
    const existingLead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        createdById: user.id,
      },
      include: {
        contacts: true,
      },
    });

    if (!existingLead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        address,
        price,
        beds,
        zipCode,
        priority,
        source,
        notes,
        nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
      },
    });

    // Handle phone number - create or update contact
    if (phoneNumber && phoneNumber.trim()) {
      const trimmedPhone = phoneNumber.trim();
      
      // Check if lead already has a contact with this phone number
      const existingContact = existingLead.contacts.find(c => c.phoneNumber === trimmedPhone);
      
      if (!existingContact) {
        // Check if lead has any contacts
        if (existingLead.contacts.length > 0) {
          // Update the first contact's phone number
          await prisma.contact.update({
            where: { id: existingLead.contacts[0].id },
            data: { phoneNumber: trimmedPhone },
          });
        } else {
          // Create new contact
          await prisma.contact.create({
            data: {
              phoneNumber: trimmedPhone,
              type: 'AGENT',
              leads: {
                connect: { id: leadId }
              }
            },
          });
        }
      }
    } else if (phoneNumber === '' && existingLead.contacts.length > 0) {
      // If phone number is cleared, remove the first contact
      await prisma.contact.delete({
        where: { id: existingLead.contacts[0].id },
      });
    }

    // Fetch updated lead with contacts
    const updatedLead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contacts: true,
        leadActivities: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    // Log update activity
    await logActivity(
      leadId,
      user.id,
      'NOTE_ADDED',
      'Lead information updated',
      { 
        updatedFields: Object.keys(req.body),
        phoneNumberUpdated: !!phoneNumber 
      }
    );

    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// PUT /api/leads/:id/status - Update lead status
router.put('/:id/status', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const leadId = parseInt(req.params.id);
    const { status, notes } = req.body;

    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    // Check if lead belongs to user
    const existingLead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        createdById: user.id,
      },
    });

    if (!existingLead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        status,
        lastContactDate: new Date(),
        notes: notes || existingLead.notes,
      },
    });

    // Log status change activity
    await logActivity(
      leadId,
      user.id,
      'STATUS_CHANGED',
      `Status changed from ${existingLead.status} to ${status}`,
      { 
        previousStatus: existingLead.status,
        newStatus: status,
        notes 
      }
    );

    res.json(lead);
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ error: 'Failed to update lead status' });
  }
});

// POST /api/leads/:id/notes - Add note to lead
router.post('/:id/notes', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const leadId = parseInt(req.params.id);
    const { note } = req.body;

    if (!note) {
      res.status(400).json({ error: 'Note is required' });
      return;
    }

    // Check if lead belongs to user
    const existingLead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        createdById: user.id,
      },
    });

    if (!existingLead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    // Update lead with new note
    const updatedNotes = existingLead.notes 
      ? `${existingLead.notes}\n\n${new Date().toISOString()}: ${note}`
      : note;

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        notes: updatedNotes,
      },
    });

    // Log note activity
    await logActivity(
      leadId,
      user.id,
      'NOTE_ADDED',
      note,
      { noteLength: note.length }
    );

    res.json(lead);
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// GET /api/leads/:id/activities - Get lead activity history
router.get('/:id/activities', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const leadId = parseInt(req.params.id);
    const { page = 1, limit = 50 } = req.query;
    
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Check if user can access this lead (same logic as lead detail route)
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        OR: [
          { source: 'ZILLOW' }, // Allow all users to view activities for Zillow scraped leads
          { createdById: user.id } // Allow users to view activities for their own manually created leads
        ]
      },
    });

    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const [activities, total] = await Promise.all([
      prisma.leadActivity.findMany({
        where: { leadId },
        include: {
          user: {
            select: { email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.leadActivity.count({ where: { leadId } }),
    ]);

    res.json({
      activities,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// POST /api/leads/:id/follow-up - Schedule follow-up
router.post('/:id/follow-up', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const leadId = parseInt(req.params.id);
    const { followUpDate, notes } = req.body;

    if (!followUpDate) {
      res.status(400).json({ error: 'Follow-up date is required' });
      return;
    }

    // Check if lead belongs to user
    const existingLead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        createdById: user.id,
      },
    });

    if (!existingLead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        nextFollowUpDate: new Date(followUpDate),
      },
    });

    // Log follow-up activity
    await logActivity(
      leadId,
      user.id,
      'FOLLOW_UP_SCHEDULED',
      `Follow-up scheduled for ${new Date(followUpDate).toLocaleDateString()}${notes ? `: ${notes}` : ''}`,
      { 
        followUpDate,
        notes 
      }
    );

    res.json(lead);
  } catch (error) {
    console.error('Error scheduling follow-up:', error);
    res.status(500).json({ error: 'Failed to schedule follow-up' });
  }
});

// DELETE /api/leads/:id - Delete lead
router.delete('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const leadId = parseInt(req.params.id);

    // Check if lead belongs to user
    const existingLead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        createdById: user.id,
      },
    });

    if (!existingLead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    await prisma.lead.delete({
      where: { id: leadId },
    });

    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// GET /api/leads/region/:region - Get leads by region (for Zillow data)
router.get('/region/:region', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;

  try {
    const { region } = req.params;
    
    const leads = await prisma.lead.findMany({
      where: {
        region,
        OR: [
          { source: 'ZILLOW' }, // Show all Zillow scraped leads to everyone
          { createdById: user.id } // Show user's own manually created leads
        ]
      },
      include: {
        contacts: true,
        appointments: {
          take: 1,
          orderBy: { datetime: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads by region:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// GET /api/leads/zip/:zip - Get leads by ZIP code
router.get('/zip/:zip', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;

  try {
    const { zip } = req.params;
    
    const leads = await prisma.lead.findMany({
      where: {
        zipCode: zip,
        OR: [
          { source: 'ZILLOW' }, // Show all Zillow scraped leads to everyone
          { createdById: user.id } // Show user's own manually created leads
        ]
      },
      include: {
        contacts: true,
        appointments: {
          take: 1,
          orderBy: { datetime: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads by ZIP:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

export default router; 