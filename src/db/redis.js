const IORedis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS;
const REDIS_NODES = process.env.REDIS_CLUSTER_NODES || process.env.REDIS_NODES; // comma separated host:port
const REDIS_USE_CLUSTER = (process.env.REDIS_USE_CLUSTER === 'true') || !!REDIS_NODES;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.REDIS_PW || null;
const REDIS_TLS = process.env.REDIS_TLS === 'true';

let client = null;

function makeRedisOptions() {
    const opts = {};
    if (REDIS_PASSWORD) opts.password = REDIS_PASSWORD;
    if (REDIS_TLS) opts.tls = {};
    // Limit retries to avoid long hangs
    if (process.env.REDIS_MAX_RETRIES) opts.maxRetriesPerRequest = Number(process.env.REDIS_MAX_RETRIES);
    return opts;
}

try {
    if (REDIS_USE_CLUSTER && REDIS_NODES) {
        const nodes = REDIS_NODES.split(',').map((n) => {
            const [host, port] = n.split(':');
            return { host, port: Number(port || 6379) };
        });
        client = new IORedis.Cluster(nodes, { redisOptions: makeRedisOptions() });
        client.isCluster = true;
        console.info('Redis: connecting in cluster mode to nodes:', nodes);
    } else if (REDIS_URL) {
        client = new IORedis(REDIS_URL, makeRedisOptions());
        client.isCluster = false;
        console.info('Redis: connecting to', REDIS_URL);
    } else {
        console.warn('REDIS_URL not configured; Redis disabled.');
        client = null;
    }

    if (client) {
        client.on('error', (e) => console.error('Redis error:', e));
        client.on('connect', () => console.info('Redis connected'));
        client.on('ready', () => console.info('Redis ready'));

        // attach lightweight helpers
        client.pingCheck = async () => {
            try {
                return await client.ping();
            } catch (e) {
                console.error('Redis ping failed', e);
                return null;
            }
        };
    }
} catch (e) {
    console.error('Failed to initialize Redis client', e);
    client = null;
}

module.exports = client;
