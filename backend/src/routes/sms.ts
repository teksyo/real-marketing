import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Helper function to log lead activity
const logSmsActivity = async (leadId: number, userId: number, type: string, content: string, metadata?: any) => {
  try {
    await prisma.leadActivity.create({
      data: {
        leadId,
        userId,
        type: type as any,
        description: `SMS ${type.toLowerCase().replace('_', ' ')}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
        metadata: metadata || null,
      },
    });
  } catch (error) {
    console.error('Failed to log SMS activity:', error);
  }
};

// GET /api/sms/conversations - Get all SMS conversations for user
router.get('/conversations', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const { page = 1, limit = 20, leadId } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const where: any = {
      userId: user.id,
    };
    
    if (leadId) {
      where.leadId = parseInt(leadId as string);
    }

    const [conversations, total] = await Promise.all([
      prisma.smsConversation.findMany({
        where,
        include: {
          lead: {
            select: {
              id: true,
              address: true,
              zipCode: true,
              status: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.smsConversation.count({ where }),
    ]);

    res.json({
      conversations,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Error fetching SMS conversations:', error);
    res.status(500).json({ error: 'Failed to fetch SMS conversations' });
  }
});

// GET /api/sms/conversations/:id - Get specific conversation with all messages
router.get('/conversations/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const conversationId = parseInt(req.params.id);
    
    const conversation = await prisma.smsConversation.findFirst({
      where: {
        id: conversationId,
        userId: user.id,
      },
      include: {
        lead: {
          select: {
            id: true,
            address: true,
            zipCode: true,
            status: true,
            priority: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// POST /api/sms/conversations - Create new SMS conversation
router.post('/conversations', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const { leadId, phoneNumber } = req.body;

    if (!leadId || !phoneNumber) {
      res.status(400).json({ error: 'Lead ID and phone number are required' });
      return;
    }

    // Check if lead belongs to user
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        createdById: user.id,
      },
    });

    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    // Check if conversation already exists
    const existingConversation = await prisma.smsConversation.findFirst({
      where: {
        leadId,
        phoneNumber,
      },
    });

    if (existingConversation) {
      res.status(400).json({ error: 'Conversation already exists for this lead and phone number' });
      return;
    }

    const conversation = await prisma.smsConversation.create({
      data: {
        leadId,
        userId: user.id,
        phoneNumber,
      },
      include: {
        lead: {
          select: {
            id: true,
            address: true,
            zipCode: true,
            status: true,
          },
        },
        messages: true,
      },
    });

    res.status(201).json(conversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// POST /api/sms/send - Send SMS message
router.post('/send', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const { conversationId, content, phoneNumber } = req.body;

    if (!conversationId || !content) {
      res.status(400).json({ error: 'Conversation ID and content are required' });
      return;
    }

    // Check if conversation belongs to user
    const conversation = await prisma.smsConversation.findFirst({
      where: {
        id: conversationId,
        userId: user.id,
      },
      include: {
        lead: true,
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // TODO: Integrate with actual SMS service (Twilio, etc.)
    // For now, we'll just save the message as sent
    const message = await prisma.smsMessage.create({
      data: {
        conversationId,
        direction: 'OUTBOUND',
        content,
        status: 'SENT',
        phoneNumber: conversation.phoneNumber,
      },
    });

    // Update conversation timestamp
    await prisma.smsConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Log SMS activity
    await logSmsActivity(
      conversation.leadId,
      user.id,
      'SMS_SENT',
      content,
      { messageId: message.id, phoneNumber: conversation.phoneNumber }
    );

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// POST /api/sms/receive - Webhook for receiving SMS (placeholder)
router.post('/receive', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, body, messageId } = req.body;

    if (!from || !body) {
      res.status(400).json({ error: 'From and body are required' });
      return;
    }

    // Find conversation by phone number
    const conversation = await prisma.smsConversation.findFirst({
      where: {
        phoneNumber: from,
      },
      include: {
        lead: true,
      },
    });

    if (!conversation) {
      // Could create a new conversation or handle unknown numbers
      res.status(404).json({ error: 'Conversation not found for this phone number' });
      return;
    }

    // Save incoming message
    const message = await prisma.smsMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        content: body,
        status: 'DELIVERED',
        phoneNumber: from,
      },
    });

    // Update conversation timestamp
    await prisma.smsConversation.update({
      where: { id: conversation.id },
      data: { 
        updatedAt: new Date(),
        isActive: true,
      },
    });

    // Log SMS activity
    await logSmsActivity(
      conversation.leadId,
      conversation.userId,
      'SMS_RECEIVED',
      body,
      { messageId: message.id, phoneNumber: from }
    );

    res.json({ success: true, messageId: message.id });
  } catch (error) {
    console.error('Error processing incoming SMS:', error);
    res.status(500).json({ error: 'Failed to process incoming SMS' });
  }
});

// GET /api/sms/messages/:conversationId - Get messages for conversation
router.get('/messages/:conversationId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const conversationId = parseInt(req.params.conversationId);
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Check if conversation belongs to user
    const conversation = await prisma.smsConversation.findFirst({
      where: {
        id: conversationId,
        userId: user.id,
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const [messages, total] = await Promise.all([
      prisma.smsMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.smsMessage.count({ where: { conversationId } }),
    ]);

    res.json({
      messages,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// PUT /api/sms/conversations/:id/status - Update conversation status
router.put('/conversations/:id/status', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const conversationId = parseInt(req.params.id);
    const { isActive } = req.body;

    // Check if conversation belongs to user
    const conversation = await prisma.smsConversation.findFirst({
      where: {
        id: conversationId,
        userId: user.id,
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const updatedConversation = await prisma.smsConversation.update({
      where: { id: conversationId },
      data: { isActive },
    });

    res.json(updatedConversation);
  } catch (error) {
    console.error('Error updating conversation status:', error);
    res.status(500).json({ error: 'Failed to update conversation status' });
  }
});

// PUT /api/sms/messages/:id/status - Update message status
router.put('/messages/:id/status', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const messageId = parseInt(req.params.id);
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    // Check if message belongs to user's conversation
    const message = await prisma.smsMessage.findFirst({
      where: {
        id: messageId,
        conversation: {
          userId: user.id,
        },
      },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const updatedMessage = await prisma.smsMessage.update({
      where: { id: messageId },
      data: { status },
    });

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error updating message status:', error);
    res.status(500).json({ error: 'Failed to update message status' });
  }
});

// GET /api/sms/stats - Get SMS statistics
router.get('/stats', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const [
      totalMessages,
      activeConversations,
      totalConversations,
      sentMessages,
      receivedMessages
    ] = await Promise.all([
      prisma.smsMessage.count({
        where: {
          conversation: {
            userId: user.id,
          },
        },
      }),
      prisma.smsConversation.count({
        where: {
          userId: user.id,
          isActive: true,
        },
      }),
      prisma.smsConversation.count({
        where: {
          userId: user.id,
        },
      }),
      prisma.smsMessage.count({
        where: {
          conversation: {
            userId: user.id,
          },
          direction: 'OUTBOUND',
        },
      }),
      prisma.smsMessage.count({
        where: {
          conversation: {
            userId: user.id,
          },
          direction: 'INBOUND',
        },
      }),
    ]);

    const responseRate = sentMessages > 0 ? Math.round((receivedMessages / sentMessages) * 100) : 0;

    res.json({
      totalMessages,
      activeConversations,
      totalConversations,
      sentMessages,
      receivedMessages,
      responseRate: responseRate.toString(),
    });
  } catch (error) {
    console.error('Error fetching SMS stats:', error);
    res.status(500).json({ error: 'Failed to fetch SMS statistics' });
  }
});

// DELETE /api/sms/conversations/:id - Delete conversation
router.delete('/conversations/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  
  try {
    const conversationId = parseInt(req.params.id);

    // Check if conversation belongs to user
    const conversation = await prisma.smsConversation.findFirst({
      where: {
        id: conversationId,
        userId: user.id,
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    await prisma.smsConversation.delete({
      where: { id: conversationId },
    });

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router; 