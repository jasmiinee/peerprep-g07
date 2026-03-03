import { QueueEntry, QueueKeyString } from "../types";
import type { WebSocket } from "ws";

export type UserState = { enqueuedAt: number; queueKey: QueueKeyString };

export const queueMap = new Map<string, QueueEntry[]>();

// Stores active users in the queue
export const userStateMap = new Map<string, UserState>();

// Stores active users in the queue -> User's WebSocket connection
export const wsConnectionMap = new Map<string, WebSocket>();