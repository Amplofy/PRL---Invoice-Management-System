import { Router } from 'express'
import multer from 'multer'
import { authRequired } from '../middleware/auth.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

export const uploadsRouter = Router()

const store = new Map<string, { buffer: Buffer; name: string; expires: number }>()
const TTL = 30 * 60 * 1000 // 30 minutes

function cleanup(): void {
  const now = Date.now()
  for (const [id, entry] of store) {
    if (entry.expires < now) store.delete(id)
  }
}

setInterval(cleanup, 5 * 60 * 1000).unref()

uploadsRouter.post('/', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' })
    return
  }
  cleanup()
  const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  store.set(id, { buffer: req.file.buffer, name: req.file.originalname, expires: Date.now() + TTL })
  res.json({ fileId: id, fileName: req.file.originalname })
})

export function getUploadedFile(id: string): { buffer: Buffer; name: string } | null {
  const entry = store.get(id)
  if (!entry || entry.expires < Date.now()) return null
  return { buffer: entry.buffer, name: entry.name }
}
