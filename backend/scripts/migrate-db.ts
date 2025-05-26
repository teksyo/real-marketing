import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

async function exportData() {
  try {
    // Export Users
    const users = await prisma.user.findMany();
    
    // Export Leads
    const leads = await prisma.lead.findMany();
    
    // Export Contacts
    const contacts = await prisma.contact.findMany();
    
    const exportData = {
      users,
      leads,
      contacts,
      timestamp: new Date().toISOString()
    };

    // Create exports directory if it doesn't exist
    await fs.mkdir(path.join(__dirname, '../exports'), { recursive: true });
    
    // Save to file
    await fs.writeFile(
      path.join(__dirname, '../exports/database-export.json'),
      JSON.stringify(exportData, null, 2)
    );

    console.log('Data exported successfully to exports/database-export.json');
  } catch (error) {
    console.error('Export failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

exportData(); 