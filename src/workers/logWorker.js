const prisma = require('../db/prisma');
const redis = require('../db/redis');

async function processLog(logJson) {
    try {
        const data = JSON.parse(logJson);
        await prisma.api_logs.create({
            data: {
                timestamp: new Date(data.timestamp),
                ip: data.ip,
                method: data.method,
                path: data.path,
                status: data.status,
                duration_ms: data.duration_ms,
                user_id: data.user_id || null,
                body: data.body || null,
            },
        });
    } catch (e) {
        console.error('logWorker failed to write log to DB', e, logJson);
    }
}

async function run() {
    if (!redis) {
        console.warn('logWorker: redis not configured, worker not started');
        return;
    }

    console.log('logWorker started, listening to log_queue');
    while (true) {
        try {
            // BRPOP blocking pop with timeout 5s
            const res = await redis.brpop('log_queue', 5);
            if (!res) continue;
            const [, logJson] = res;
            await processLog(logJson);
        } catch (e) {
            console.error('logWorker error', e);
            // sleep a bit before retrying
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
}

run().catch((e) => console.error('logWorker fatal', e));
