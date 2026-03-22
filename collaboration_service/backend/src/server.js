const WebSocket = require('ws');
const crypto = require('crypto');

// API
const express = require("express");
const cors = require("cors");

// Redis
const redis = require('redis');

const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// For websocket
const PORT = 8080;

// Trying to match users based on text written, if same text then matched and put into the same room
// At every point text will only have 1 client waiting, if there is a 2nd client it will be popped and matched
// { text : client(Websocket) }
// Used for the matching service
const waitingUsers = {};

// Yjs room tracking: { roomName: Set<WebSocket> } 
// This is to track who is still connected or not, only created when Monaco Editor is mounted
const yjsRooms = {};

function handleYjsConnection(ws, roomId) {
    if (!yjsRooms[roomId]) {
        yjsRooms[roomId] = new Set();
    }

    const room = yjsRooms[roomId];
    room.add(ws);

    console.log(`Yjs client joined room: ${roomId} (${room.size} clients)`);

    ws.on('message', (message) => {
        // Yjs messages are binary — broadcast to all OTHER clients in the same room
        room.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    ws.on('close', () => {
        room.delete(ws);
        console.log(`Yjs client left room: ${roomId} (${room.size} remaining)`);
        if (room.size === 0) {
            delete yjsRooms[roomId];
        }
    });

    ws.on('error', (err) => {
        console.error(`Yjs WS error in room ${roomId}:`, err);
        room.delete(ws);
    });
}

// For API calls to question service
const app = express();
app.use(cors());

app.get("/room/:roomId", async (req, res) => {
    const { roomId } = req.params;

    // For now we are hardcoding the question and programming language, 
    // but in the future we can fetch it from the question service based on the roomId
    //const room = dataRooms[roomId];
    try {
        const room = await redisClient.hGetAll(`room:${roomId}`);

        if (!room || !room.question || !room.programmingLanguage) {
            return res.status(404).json({ error: "Room not found" });
        }

        return res.json({
            question: room.question,
            programmingLanguage: room.programmingLanguage
        });
    } catch (err) {
        console.error("Failed to fetch room from redis:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

const HTTP_PORT = 3000;

async function startServer() {
    await redisClient.connect();
    console.log('Connected to Redis');

    // Create a WebSocket server for the matchmaking service
    const wss = new WebSocket.Server({ port: PORT }, () => {
        console.log(`WebSocket server is running on ws://localhost:${PORT}`);
    });

    // Listening for connection for matchmaking
    wss.on('connection', (ws, req) => {
        const requestPath = req.url || "";

        // If the connection is for Yjs syncing
        if (requestPath.startsWith("/yjs")) {
            // Parse room id safely from /yjs/:roomId (ignore query string)
            const requestUrl = new URL(requestPath, `ws://${req.headers.host}`);
            const pathParts = requestUrl.pathname.split('/').filter(Boolean);
            const roomId = pathParts[1] || 'default';
            console.log("Start YJS connection")
            handleYjsConnection(ws, roomId);
            return;
        }

        console.log('New Client Connected');

        ws.on('message', async (message) => {
            try {
                const { type, text } = JSON.parse(message);
                // Logic for handling matching of people when ppl click find match button
                if (type === "find_match") {
                    // if there is a user waiting with the same text, match them together and remove from dictionary
                    if (waitingUsers[text]) {
                        // Match is found and there is a client to the text
                        // Create a new room and redirect both clients into the coding space
                        console.log('Match Found, creating room');

                        const otherWs = waitingUsers[text]; // Get the other client waiting in the dictionary
                        delete waitingUsers[text]; // Remove the matched client from the waiting list

                        const roomId = crypto.randomUUID();// Unique room ID based on timestamp

                        // Fetch data from question service based on the text
                        const question = `
                            Given an integer array nums, return all the triplets [nums[i], nums[j], nums[k]] 
                            where nums[i] + nums[j] + nums[k] == 0, and the indices i, j and k are all distinct.
                            The output should not contain any duplicate triplets. 
                            You may return the output and the triplets in any order.`;
                        const programmingLanguage = "python";

                        await redisClient.hSet(`room:${roomId}`, {
                            question,
                            programmingLanguage
                        });

                        // Notify both clients about the match and room ID
                        ws.send(JSON.stringify({ type: 'match_found', roomId }));
                        otherWs.send(JSON.stringify({ type: 'match_found', roomId }));
                    } else {
                        // No match found, add user to waiting list
                        if (!waitingUsers[text]) {
                            waitingUsers[text] = ws;
                            console.log("Waiting Users:", waitingUsers)
                        }
                    }
                }
            } catch (err) {
                console.error('Error handling websocket message:', err);
            }
        });

        ws.on('close', () => {
            console.log('Client Disconnected');
        });
    })

    app.listen(HTTP_PORT, () => {
        console.log(`HTTP server running on http://localhost:${HTTP_PORT}`);
    });
}

startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

