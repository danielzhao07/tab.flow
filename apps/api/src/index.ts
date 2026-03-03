/**
 * Tab.Flow API Server
 *
 * Express.js backend providing:
 * - Cloud sync for workspaces, bookmarks, notes, and settings
 * - AI semantic search via Gemini embeddings + pgvector
 * - Tab analytics and usage tracking
 * - Tab thumbnail storage via AWS S3
 * - User authentication via AWS Cognito
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { syncRouter } from './routes/sync.js';
import { aiRouter } from './routes/ai.js';
import { analyticsRouter } from './routes/analytics.js';
import { thumbnailRouter } from './routes/thumbnails.js';
import { authRouter } from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const USE_AUTH = process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID;

// ---- Middleware ----
app.use(cors({
    origin: true, // allow any origin — content scripts send from the page's origin
    credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

// Request logging (development)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, _res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
        next();
    });
}

// ---- Auth (public — token exchange proxy, no JWT required) ----
app.use('/api/auth', authRouter);

// ---- Health Check (public) ----
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'tabflow-api',
        version: '0.2.0',
        timestamp: new Date().toISOString(),
        auth: USE_AUTH ? 'cognito' : 'disabled',
    });
});

// ---- API Routes ----
if (USE_AUTH) {
    app.use('/api/sync', requireAuth as any, syncRouter);
    app.use('/api/ai', requireAuth as any, aiRouter);
    app.use('/api/analytics', requireAuth as any, analyticsRouter);
    app.use('/api/thumbnails', requireAuth as any, thumbnailRouter);
} else {
    console.warn('WARNING: Running without Cognito auth. Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID to enable.');
    app.use('/api/sync', syncRouter);
    app.use('/api/ai', aiRouter);
    app.use('/api/analytics', analyticsRouter);
    app.use('/api/thumbnails', thumbnailRouter);
}

// ---- Error Handler ----
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && { message: err.message }),
    });
});

// ---- Start Server ----
app.listen(PORT, () => {
    console.log(`Tab.Flow API running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Auth: ${USE_AUTH ? 'AWS Cognito enabled' : 'Disabled (dev mode)'}`);
});

export default app;
