// src/server.ts
import { cfg } from "./config";
import app from "./app";
import { logger } from "./logger";

app.listen(cfg.port, () => logger.info({ port: cfg.port }, "API up"));
