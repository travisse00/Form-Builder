import dotenv from "dotenv";

// Next.js skips .env.local when NODE_ENV is "test", so load it ourselves
dotenv.config({ path: ".env.local" });