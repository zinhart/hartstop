import { Router } from "express";
const r = Router();

r.get("/healthz", (_req, res) => res.send("ok"));
r.get("/readyz", (_req, res) => res.send("ready"));
r.get("/version", (_req, res) => res.json({ sha: process.env.GIT_SHA ?? "dev" }));

export default r;
