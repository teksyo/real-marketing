import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/auth";
import { Twilio } from "twilio";
import MessagingResponse from "twilio/lib/twiml/MessagingResponse";
const router = express.Router();
const prisma = new PrismaClient();

const twilioClient = new Twilio(
  process.env.TWILIO_SID!,
  process.env.TWILIO_SECRET!
);

async function getOrBuyTwilioPhone(): Promise<string> {
  // Check if stored in DB
  const setting = await prisma.setting.findUnique({
    where: { key: "TWILIO_PHONE" },
  });

  if (setting?.value) {
    return setting.value;
  }

  // Otherwise buy a new SMS-capable number
  const numbers = await twilioClient.availablePhoneNumbers("US").local.list({
    smsEnabled: true,
    limit: 1,
  });
  console.log("Available Twilio numbers:", numbers);
  if (numbers.length === 0) {
    throw new Error("No available Twilio numbers with SMS support");
  }

  const purchased = await twilioClient.incomingPhoneNumbers.create({
    phoneNumber: numbers[0].phoneNumber,
  });
  console.log("Purchased Twilio number:", purchased.phoneNumber);
  // Save to DB for future use
  await prisma.setting.upsert({
    where: { key: "TWILIO_PHONE" },
    update: { value: purchased.phoneNumber },
    create: { key: "TWILIO_PHONE", value: purchased.phoneNumber },
  });

  return purchased.phoneNumber;
}

// Helper function to log lead activity
const logSmsActivity = async (
  leadId: number,
  userId: number,
  type: string,
  content: string,
  metadata?: any
) => {
  try {
    await prisma.leadActivity.create({
      data: {
        leadId,
        userId,
        type: type as any,
        description: `SMS ${type
          .toLowerCase()
          .replace("_", " ")}: ${content.substring(0, 100)}${
          content.length > 100 ? "..." : ""
        }`,
        metadata: metadata || null,
      },
    });
  } catch (error) {
    console.error("Failed to log SMS activity:", error);
  }
};

router.post(
  "/twilio/inbound",
  async (req: Request, res: Response): Promise<void> => {
    const twiml = new MessagingResponse();

    const incomingMessage = req.body.Body?.trim();
    const fromNumber = req.body.From; // Client's number
    const toNumber = req.body.To; // Your Twilio number (should match Setting.value)

    const STOP_WORDS = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
    const normalizedFrom = fromNumber.replace(/\D/g, "").replace(/^1/, "");
    const normalizedTo = toNumber.replace(/\D/g, "").replace(/^1/, "");

    try {
      // ✅ Handle opt-out
      if (STOP_WORDS.includes(incomingMessage.toUpperCase())) {
        await prisma.smsOptOut.upsert({
          where: { phoneNumber: fromNumber },
          update: { optedOutAt: new Date(), reason: "User replied with STOP" },
          create: { phoneNumber: fromNumber, reason: "User replied with STOP" },
        });

        twiml.message(
          "You have been unsubscribed. Reply START to opt back in."
        );
        res.type("text/xml").send(twiml.toString());
        return;
      }

      // ✅ Handle opt-in
      if (incomingMessage.toUpperCase() === "START") {
        await prisma.smsOptOut.deleteMany({
          where: { phoneNumber: fromNumber },
        });
        twiml.message(
          "You have been resubscribed. You'll now receive messages."
        );
        res.type("text/xml").send(twiml.toString());
        return;
      }

      // ✅ Find active Twilio number from Setting
      const twilioNumberSetting = await prisma.setting.findUnique({
        where: { key: "TWILIO_PHONE" },
      });

      if (!twilioNumberSetting || twilioNumberSetting.value !== toNumber) {
        console.error("Twilio number mismatch");
        res.status(400).send("Invalid destination number.");
      }

      // ✅ Match conversation using `lead phoneNumber + twilioNumber`
      const conversation = await prisma.smsConversation.findFirst({
        where: {
          phoneNumber: fromNumber,
          // If multiple users share a Twilio number, you may need to scope by userId
        },
        orderBy: { updatedAt: "desc" },
      });

      if (!conversation) {
        console.warn("No matching conversation found.");
        res.status(200).send(); // Don't bounce Twilio if we just want to ignore
        return;
      }

      // ✅ Save incoming message
      await prisma.smsMessage.create({
        data: {
          conversationId: conversation.id,
          direction: "INBOUND",
          content: incomingMessage,
          phoneNumber: fromNumber,
          status: "DELIVERED",
          sentAt: new Date(),
        },
      });

      // ✅ Update conversation timestamp
      await prisma.smsConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      res.type("text/xml").send(twiml.toString());
    } catch (err) {
      console.error("Inbound SMS handler error:", err);
      res.status(500).send("Webhook error");
    }
  }
);

// GET /api/sms/conversations - Get all SMS conversations for user
router.get(
  "/conversations",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
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
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            _count: {
              select: {
                messages: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
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
      console.error("Error fetching SMS conversations:", error);
      res.status(500).json({ error: "Failed to fetch SMS conversations" });
    }
  }
);

// GET /api/sms/conversations/:id - Get specific conversation with all messages
router.get(
  "/conversations/:id",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
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
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      res.json(conversation);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  }
);

// POST /api/sms/conversations - Create new SMS conversation
router.post(
  "/conversations",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;

    try {
      const { leadId, phoneNumber, initialMessage } = req.body.messageDetail;

      if (!leadId || !phoneNumber || !initialMessage) {
        res.status(400).json({
          error: "Lead ID, phone number, and initial message are required",
        });
        return;
      }

      // ✅ Normalize phone number
      let normalizedPhone = phoneNumber.trim().replace(/\D/g, "");
      if (!normalizedPhone.startsWith("1")) {
        normalizedPhone = "1" + normalizedPhone;
      }
      normalizedPhone = "+" + normalizedPhone;

      const lead = await prisma.lead.findFirst({
        where: { id: leadId },
      });

      if (!lead) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }

      const existingConversation = await prisma.smsConversation.findFirst({
        where: {
          leadId,
          phoneNumber: normalizedPhone,
        },
      });

      if (existingConversation) {
        let messageStatus: "SENT" | "FAILED" = "SENT";
        let sentAt: Date | undefined = undefined;
        let errorMessage: string | undefined = undefined;

        try {
          const result = await twilioClient.messages.create({
            body: initialMessage,
            from:
              existingConversation.phoneNumber ?? (await getOrBuyTwilioPhone()),
            to: normalizedPhone,
          });
          sentAt = new Date(); // or result.dateCreated
        } catch (twilioError: any) {
          messageStatus = "FAILED";
          errorMessage = twilioError?.message || "Failed to send message";
          console.error("Twilio send error:", errorMessage);
        }

        const conversation = await prisma.$transaction(async (tx) => {
          await tx.smsMessage.create({
            data: {
              conversationId: existingConversation.id,
              direction: "OUTBOUND",
              content: initialMessage,
              phoneNumber: normalizedPhone,
              status: messageStatus,
              sentAt: new Date(),
              errorMessage,
            },
          });

          return await tx.smsConversation.findUnique({
            where: { id: existingConversation.id },
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
        });

        res.status(201).json(conversation);
        return;
      }

      const senderPhone = await getOrBuyTwilioPhone();

      let messageStatus: "SENT" | "FAILED" = "SENT";
      let sentAt: Date | undefined = undefined;
      let errorMessage: string | undefined = undefined;

      try {
        const result = await twilioClient.messages.create({
          body: initialMessage,
          from: senderPhone,
          to: normalizedPhone,
        });
        sentAt = new Date();
      } catch (twilioError: any) {
        messageStatus = "FAILED";
        errorMessage = twilioError?.message || "Failed to send message";
        console.error("Twilio send error:", errorMessage);
      }

      const conversation = await prisma.$transaction(async (tx) => {
        const convo = await tx.smsConversation.create({
          data: {
            leadId,
            userId: user.id,
            phoneNumber: normalizedPhone,
          },
        });

        await tx.smsMessage.create({
          data: {
            conversationId: convo.id,
            direction: "OUTBOUND",
            content: initialMessage,
            phoneNumber: normalizedPhone,
            status: messageStatus,
            sentAt: new Date(),
            errorMessage,
          },
        });

        return await tx.smsConversation.findUnique({
          where: { id: convo.id },
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
      });

      res.status(201).json(conversation);
    } catch (error) {
      console.error("Conversation creation failed:", error);
      res.status(500).json({ error: "Failed to create and send message" });
    }
  }
);

// POST /api/sms/send - Send SMS message
router.post(
  "/send",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;

    try {
      const { conversationId, content, phoneNumber } = req.body;

      if (!conversationId || !content) {
        res.status(400).json({
          error: "Conversation ID and content are required",
        });
        return;
      }

      // Fetch conversation and ensure it belongs to the user
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
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      // ✅ Normalize recipient phone number (use provided one or fallback)
      let normalizedPhone = (phoneNumber || conversation.phoneNumber || "")
        .trim()
        .replace(/\D/g, "");
      if (!normalizedPhone.startsWith("1")) {
        normalizedPhone = "1" + normalizedPhone;
      }
      normalizedPhone = "+" + normalizedPhone;

      // ✅ Send SMS via Twilio
      let messageStatus: "SENT" | "FAILED" = "SENT";
      let sentAt: Date | undefined = undefined;
      let errorMessage: string | undefined = undefined;
      const senderPhone = await getOrBuyTwilioPhone();
      try {
        const result = await twilioClient.messages.create({
          body: content,
          from: senderPhone,
          to: normalizedPhone,
        });
        sentAt = new Date(); // or result.dateCreated
      } catch (twilioError: any) {
        messageStatus = "FAILED";
        errorMessage = twilioError?.message || "Failed to send SMS";
        console.error("Twilio send error:", errorMessage);
      }

      // ✅ Save message record in DB
      const message = await prisma.smsMessage.create({
        data: {
          conversationId,
          direction: "OUTBOUND",
          content,
          status: messageStatus,
          phoneNumber: normalizedPhone,
          sentAt: sentAt || new Date(),
          errorMessage,
        },
      });

      // ✅ Update conversation timestamp
      await prisma.smsConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      // ✅ Log activity
      await logSmsActivity(conversation.leadId, user.id, "SMS_SENT", content, {
        messageId: message.id,
        phoneNumber: normalizedPhone,
      });

      res.status(201).json(message);
    } catch (error) {
      console.error("Error sending SMS:", error);
      res.status(500).json({ error: "Failed to send SMS" });
    }
  }
);

// POST /api/sms/receive - Webhook for receiving SMS (placeholder)
router.post(
  "/receive",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { from, body, messageId } = req.body;

      if (!from || !body) {
        res.status(400).json({ error: "From and body are required" });
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
        res
          .status(404)
          .json({ error: "Conversation not found for this phone number" });
        return;
      }

      // Save incoming message
      const message = await prisma.smsMessage.create({
        data: {
          conversationId: conversation.id,
          direction: "INBOUND",
          content: body,
          status: "DELIVERED",
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
        "SMS_RECEIVED",
        body,
        { messageId: message.id, phoneNumber: from }
      );

      res.json({ success: true, messageId: message.id });
    } catch (error) {
      console.error("Error processing incoming SMS:", error);
      res.status(500).json({ error: "Failed to process incoming SMS" });
    }
  }
);

// GET /api/sms/messages/:conversationId - Get messages for conversation
router.get(
  "/messages/:conversationId",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
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
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      const [messages, total] = await Promise.all([
        prisma.smsMessage.findMany({
          where: { conversationId },
          orderBy: { createdAt: "asc" },
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
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  }
);

// PUT /api/sms/conversations/:id/status - Update conversation status
router.put(
  "/conversations/:id/status",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
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
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      const updatedConversation = await prisma.smsConversation.update({
        where: { id: conversationId },
        data: { isActive },
      });

      res.json(updatedConversation);
    } catch (error) {
      console.error("Error updating conversation status:", error);
      res.status(500).json({ error: "Failed to update conversation status" });
    }
  }
);

// PUT /api/sms/messages/:id/status - Update message status
router.put(
  "/messages/:id/status",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;

    try {
      const messageId = parseInt(req.params.id);
      const { status } = req.body;

      if (!status) {
        res.status(400).json({ error: "Status is required" });
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
        res.status(404).json({ error: "Message not found" });
        return;
      }

      const updatedMessage = await prisma.smsMessage.update({
        where: { id: messageId },
        data: { status },
      });

      res.json(updatedMessage);
    } catch (error) {
      console.error("Error updating message status:", error);
      res.status(500).json({ error: "Failed to update message status" });
    }
  }
);

// GET /api/sms/stats - Get SMS statistics
router.get(
  "/stats",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;

    try {
      const [
        totalMessages,
        activeConversations,
        totalConversations,
        sentMessages,
        receivedMessages,
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
            direction: "OUTBOUND",
          },
        }),
        prisma.smsMessage.count({
          where: {
            conversation: {
              userId: user.id,
            },
            direction: "INBOUND",
          },
        }),
      ]);

      const responseRate =
        sentMessages > 0
          ? Math.round((receivedMessages / sentMessages) * 100)
          : 0;

      res.json({
        totalMessages,
        activeConversations,
        totalConversations,
        sentMessages,
        receivedMessages,
        responseRate: responseRate.toString(),
      });
    } catch (error) {
      console.error("Error fetching SMS stats:", error);
      res.status(500).json({ error: "Failed to fetch SMS statistics" });
    }
  }
);

// DELETE /api/sms/conversations/:id - Delete conversation
router.delete(
  "/conversations/:id",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
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
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      await prisma.smsConversation.delete({
        where: { id: conversationId },
      });

      res.json({ success: true, message: "Conversation deleted successfully" });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  }
);

export default router;
