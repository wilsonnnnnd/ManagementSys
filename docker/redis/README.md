This folder contains a minimal docker-compose setup to run Redis with persistence and monitoring (Prometheus + Grafana).

Usage:

1. Start the stack (from this folder):

```bash
docker compose up -d
```

2. Redis will be exposed on `localhost:6380` (host -> container mapping `6380:6379`) with data persisted to `docker/redis/data` by default.

If you already run a local Redis on `6379`, the compose file maps container Redis to host port `6380` to avoid conflicts. To change the host port, edit `docker-compose.yml` `ports` mapping for the `redis` service.
3. Prometheus UI: http://localhost:9090
4. Grafana UI: http://localhost:3000 (default credentials admin/admin)

Notes:
- The `redis.conf` enables both RDB snapshots and AOF append-only file for persistence.
- For production-grade Redis clustering, use a managed Redis service or a dedicated Redis Cluster setup. To use a Redis cluster with this application, set `REDIS_USE_CLUSTER=true` and `REDIS_CLUSTER_NODES` (comma-separated host:port list) in your environment. The `src/db/redis.js` supports connecting to a cluster (via `ioredis.Cluster`).
- Monitoring: `redis_exporter` exposes metrics Prometheus can scrape. Import Grafana dashboards for Redis to visualize.
