import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import zillowRoutes from './routes/zillow';
import leadsRoutes from './routes/leads';
import appointmentsRoutes from './routes/appointments';
import smsRoutes from './routes/sms';


dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/zillow', zillowRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/sms', smsRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));