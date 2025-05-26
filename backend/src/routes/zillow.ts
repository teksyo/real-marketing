import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { scrapeZillowWithPlaywright } from '../scrapers/playwrightZillow';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

router.get('/:zip', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { zip } = req.params;
  const user = (req as any).user;

  try {
    console.log("🔥 Calling scrapeZillow with zip:", zip);
    const listings = await scrapeZillowWithPlaywright(zip);
    console.log("✅ Got listings:", listings);

    // Save to DB with contacts
    const savedLeads = await Promise.all(
      listings.map(async (lead: any) => {
        // Create the lead
        const savedLead = await prisma.lead.create({
          data: {
            address: lead.address || '',
            price: lead.price || '',
            beds: lead.beds || '',
            link: lead.link || '',
            zipCode: zip,
            region: user.region,
            createdById: user.id,
            // Create contacts if they exist
            contacts: lead.contacts ? {
              create: lead.contacts.map((contact: any) => ({
                name: contact.name || '',
                phoneNumber: contact.phoneNumber || '',
                type: contact.type || 'AGENT',
                company: contact.company || '',
                licenseNo: contact.licenseNo || '',
                agentId: contact.agentId || null
              }))
            } : undefined
          },
          // Include contacts in the response
          include: {
            contacts: true
          }
        });

        return savedLead;
      })
    );

    // Fetch all leads for this zip code with their contacts
    const allLeads = await prisma.lead.findMany({
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

    res.json(allLeads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to scrape and save leads' });
  }
});

export default router;