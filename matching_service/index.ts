import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { cleanupTimedOutUsers } from "./src/controllers/matchingController";
import { handleWsConnection } from "./src/routes/matchingWsRoutes";

const app = express();
const PORT = process.env.PORT || 3000;

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", handleWsConnection);

server.listen(PORT, () => {
  console.log(`Matching service running on port ${PORT}`);
});

// Poll to clean up timed-out users in the queue
setInterval(cleanupTimedOutUsers, 5000);

export default app;
