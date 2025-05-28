# Real Marketing Platform

A comprehensive real estate lead generation and management platform with automated scraping, lead tracking, and appointment scheduling capabilities.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.10+
- PostgreSQL database
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd real-marketing
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Configure your .env file with database credentials
   npx prisma migrate dev
   npx prisma generate
   npm run dev
   ```
   Backend runs on: `http://localhost:5432`

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   cp .env.example .env.local
   # Configure your .env.local file with NEXT_PUBLIC_DEV_BACKEND_URL and NEXT_PUBLIC_LIVE_BACKEND_URL
   npm run dev
   ```
   Frontend runs on: `http://localhost:3000`

4. **Scraper Setup** (Optional)
   ```bash
   cd scraper
   python3 -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   pip install -r requirements.txt
   playwright install
   cp .env.example .env
   # Configure your .env file
   ```

## 📋 Project Structure

```
real-marketing/
├── backend/              # Node.js Express API
├── frontend/             # Next.js React Application
├── scraper/              # Python Web Scraper
├── pyzill_fetch_listings.py  # Standalone Zillow scraper
└── README.md
```

## 🏗️ Architecture Overview

### Technology Stack

**Backend:**
- Node.js + Express.js
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT Authentication
- bcrypt for password hashing

**Frontend:**
- Next.js 15 (App Router)
- React 18
- Tailwind CSS
- Heroicons
- JavaScript (ES6+)
- Centralized API configuration (`/utils/api.js`)

**Scraper:**
- Python 3.10+
- Playwright/Puppeteer
- BeautifulSoup4
- Prisma Python Client
- PyZill (Zillow API wrapper)

## 📚 Modules Documentation

### 1. Authentication Module

**Location:** `backend/src/routes/auth.ts`, `backend/src/controllers/auth.ts`

**Features:**
- User registration and login
- JWT token-based authentication
- Password hashing with bcrypt
- Role-based access (USER, ADMIN)
- Regional user management

**API Endpoints:**
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- Middleware: `authMiddleware` for protected routes

### 2. Leads Management Module

**Location:** `backend/src/routes/leads.ts`, `frontend/src/components/LeadsList.js`

**Features:**
- Regional lead filtering
- ZIP code-based lead search
- Contact information storage (agents/brokers)
- Lead status tracking
- Zillow integration

**API Endpoints:**
- `GET /api/leads/region/:region` - Get leads by region/state
- `GET /api/leads/zip/:zip` - Get leads by ZIP code

**Database Models:**
- `Lead` - Property information and metadata
- `Contact` - Agent/broker contact details
- Many-to-many relationship between leads and contacts

### 3. Zillow Scraping Module

**Location:** `backend/src/routes/zillow.ts`, `backend/src/scrapers/`

**Features:**
- Real-time Zillow data scraping
- Automated contact information extraction
- Duplicate prevention (by Zillow ID)
- Playwright-based scraping for reliability
- Contact-lead relationship mapping

**API Endpoints:**
- `GET /api/zillow/:zip` - Scrape and return leads for ZIP code

**Scraper Features:**
- Proxy support for scaling
- Rate limiting and stealth mode
- Error handling and retry logic
- Database integration

### 4. Appointments Module ✨ NEW

**Location:** `backend/src/routes/appointments.ts`, `frontend/src/components/appointments/`

**Features:**
- Manual appointment entry and tracking
- Lead linkage capability
- Status management (Scheduled, Completed, Canceled, Rescheduled, No Show)
- Full CRUD operations
- User-specific appointment isolation

**API Endpoints:**
- `GET /api/appointments` - Get all user appointments
- `GET /api/appointments/:id` - Get specific appointment
- `POST /api/appointments` - Create new appointment
- `PUT /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Delete appointment
- `GET /api/appointments/status/:status` - Filter by status

**Database Schema:**
```sql
model Appointment {
  id          Int               @id @default(autoincrement())
  title       String
  description String?
  datetime    DateTime
  location    String?
  status      AppointmentStatus @default(SCHEDULED)
  notes       String?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  
  // Relations
  lead        Lead?             @relation(fields: [leadId], references: [id])
  leadId      Int?
  createdBy   User              @relation(fields: [createdById], references: [id])
  createdById Int
}
```

**Frontend Components:**
- `AppointmentForm.js` - Create/edit appointment form
- `AppointmentList.js` - List view with inline editing
- `AppointmentPage.js` - Main appointments page

### 5. Dashboard Module

**Location:** `frontend/src/app/dashboard/`, `frontend/src/components/USAMap.js`

**Features:**
- Interactive US map for region selection
- Real-time leads display
- Statistics cards
- Regional lead filtering
- Responsive grid layout

**Components:**
- `USAMap.js` - Interactive SVG map component
- `DashboardLayout.js` - Common layout wrapper
- `LeadsList.js` - Leads display component

### 6. Standalone Scraper

**Location:** `pyzill_fetch_listings.py`

**Features:**
- National US property scraping
- Contact information enrichment
- Proxy rotation support
- Database persistence
- Command-line interface

**Usage:**
```bash
# Fetch all listings across US
python3 pyzill_fetch_listings.py

# Only update contact information
python3 pyzill_fetch_listings.py --skip-fetch

# Only fetch new listings
python3 pyzill_fetch_listings.py --skip-contacts
```

## 🛠️ Available Scripts

### Backend
```bash
npm run dev        # Start development server
npm run build      # Build for production
npm start          # Start production server
npm run prisma     # Prisma CLI commands
```

### Frontend
```bash
npm run dev        # Start development server (http://localhost:3000)
npm run build      # Build for production
npm start          # Start production server
npm run lint       # Run ESLint
```

### Scraper
```bash
python -m src.scraper          # Run the scraper
python pyzill_fetch_listings.py  # Run standalone scraper
```

## 🗄️ Database Schema

### Core Models

**User**
- Authentication and profile information
- Regional assignment
- One-to-many with leads and appointments

**Lead**
- Property information from Zillow
- Tracking and status fields
- Relationships with contacts and appointments

**Contact**
- Agent/broker information
- Many-to-many with leads
- Contact type classification

**Appointment**
- Manual appointment tracking
- Status workflow management
- Optional lead linkage

### Relationships
```
User (1) ──── (M) Lead (M) ──── (M) Contact
  │                 │
  │                 │
  └── (1) ──── (M) Appointment ──── (1) Lead (optional)
```

## 🚦 API Reference

### Authentication
```http
POST /api/auth/register
POST /api/auth/login
```

### Leads
```http
GET /api/leads/region/:region
GET /api/leads/zip/:zip
```

### Zillow Integration
```http
GET /api/zillow/:zip
```

### Appointments
```http
GET    /api/appointments
POST   /api/appointments
GET    /api/appointments/:id
PUT    /api/appointments/:id
DELETE /api/appointments/:id
GET    /api/appointments/status/:status
```

## 🔧 Configuration

### Environment Variables

**Backend (.env):**
```env
DATABASE_URL="postgresql://user:pass@host:port/db"
DIRECT_URL="postgresql://user:pass@host:port/db"
JWT_SECRET="your-secret-key"
PORT=5432
```

**Frontend (.env.local):**
```env
NEXT_PUBLIC_DEV_BACKEND_URL=http://localhost:5432
NEXT_PUBLIC_LIVE_BACKEND_URL=https://your-production-api.com
NEXT_PUBLIC_VERCEL_ENV=production
```

**Note:** The frontend uses a centralized API utility (`frontend/src/utils/api.js`) that automatically switches between development and production URLs based on the environment. This eliminates hardcoded API URLs throughout the application.

**Scraper (.env):**
```env
DATABASE_URL="postgresql://user:pass@host:port/db"
PROXY_USERNAME=username
PROXY_PASSWORD=password
PROXY_HOST=proxy.example.com
PROXY_PORT=8000
```

## 🔐 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- User-specific data isolation
- CORS configuration
- Environment variable protection
- SQL injection prevention (Prisma)

## 📱 User Interface

### Navigation Structure
```
Dashboard
├── Interactive US Map
├── Regional Lead Display
└── Statistics Overview

Appointments
├── Appointment List (Grid View)
├── Create/Edit Forms
├── Status Filtering
└── Lead Integration

My Account
└── Profile Management
```

### Design System
- **Framework:** Tailwind CSS
- **Icons:** Heroicons
- **Layout:** Responsive grid system
- **Color Scheme:** Professional blue/gray palette
- **Typography:** System fonts with proper hierarchy

## 🚀 Deployment

### Backend Deployment
1. Build the application: `npm run build`
2. Set production environment variables
3. Run migrations: `npx prisma migrate deploy`
4. Start: `npm start`

### Frontend Deployment
1. Build the application: `npm run build`
2. Set production environment variables
3. Deploy to hosting platform (Vercel, Netlify, etc.)

### Database Setup
1. Create PostgreSQL database
2. Configure connection strings
3. Run migrations: `npx prisma migrate deploy`
4. Generate client: `npx prisma generate`

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Database Connection:**
- Verify PostgreSQL is running
- Check DATABASE_URL format
- Ensure database exists

**Scraper Issues:**
- Install Playwright browsers: `playwright install`
- Check proxy configuration
- Verify Python dependencies

**Frontend Build Errors:**
- Clear `.next` directory: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check environment variables

### Support

For technical issues or questions:
1. Check existing GitHub issues
2. Create a new issue with detailed description
3. Include error logs and environment details

---

**Built with ❤️ for real estate professionals**