from prisma import Prisma
from typing import Dict, Optional, List
import asyncio
from datetime import datetime

class Database:
    def __init__(self):
        self.db = Prisma()
        self._ensure_connection()

    def _ensure_connection(self):
        """Ensures database connection is established"""
        asyncio.get_event_loop().run_until_complete(self.db.connect())

    async def create_lead(self, data: Dict) -> Dict:
        """
        Create a new lead in the database
        """
        try:
            lead = await self.db.lead.create(
                data={
                    'zid': data.get('zid'),
                    'address': data.get('address'),
                    'price': data.get('price'),
                    'beds': data.get('beds'),
                    'link': data.get('link'),
                    'zipCode': data.get('zipCode'),
                    'region': data.get('region'),
                    'status': 'new'
                }
            )
            return lead
        except Exception as e:
            print(f"Error creating lead: {e}")
            return None

    async def create_contact(self, data: Dict, lead_id: int) -> Dict:
        """
        Create a new contact and associate it with a lead
        """
        try:
            contact = await self.db.contact.create(
                data={
                    'agentId': data.get('agentId'),
                    'name': data.get('name'),
                    'phoneNumber': data.get('phoneNumber'),
                    'type': data.get('type', 'AGENT'),
                    'licenseNo': data.get('licenseNo'),
                    'company': data.get('company'),
                    'leads': {
                        'connect': [{'id': lead_id}]
                    }
                }
            )
            return contact
        except Exception as e:
            print(f"Error creating contact: {e}")
            return None

    async def get_lead_by_zid(self, zid: str) -> Optional[Dict]:
        """
        Check if a lead already exists by Zillow ID
        """
        try:
            lead = await self.db.lead.find_first(
                where={
                    'zid': zid
                }
            )
            return lead
        except Exception as e:
            print(f"Error finding lead: {e}")
            return None

    def __del__(self):
        """Cleanup database connection"""
        try:
            asyncio.get_event_loop().run_until_complete(self.db.disconnect())
        except:
            pass
