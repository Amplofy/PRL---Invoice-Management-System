import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { errorHandler } from './middleware/error.js'
import { importRouter } from './routes/import.js'
import { compareRouter } from './routes/compare.js'
import { uploadsRouter } from './routes/uploads.js'
import { followupsRouter } from './routes/followups.js'
import { settingsRouter } from './routes/settings.js'
import { masterRouter } from './routes/master.js'
import { invoicesRouter } from './routes/invoices.js'
import { reportsRouter } from './routes/reports.js'
import { paymentOrdersRouter } from './routes/paymentOrders.js'
import { fyLockRouter } from './routes/fyLock.js'

export const app = express()

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
  })
)
app.use(express.json({ limit: '5mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'prl-eoms-backend' })
})

app.use('/api/import', importRouter)
app.use('/api/compare', compareRouter)
app.use('/api/uploads', uploadsRouter)
app.use('/api/followups', followupsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/fy-lock', fyLockRouter)
app.use('/api', masterRouter)
app.use('/api', invoicesRouter)
app.use('/api', reportsRouter)
app.use('/api', paymentOrdersRouter)

app.use(errorHandler)
