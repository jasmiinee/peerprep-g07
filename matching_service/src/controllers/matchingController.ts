import { randomUUID } from "crypto";
import {
  queueMap,
  userStateMap,
  wsConnectionMap,
} from "../store/inMemoryStore";
import {
  Match,
  OutboundMessage,
  QueueEntry,
  QueueKeyString,
  QueueRequest,
} from "../types";
import { toQueueKey } from "../utils";

// const TIMEOUT_MS = 2 * 60 * 1000; // 2 mins timeout
const TIMEOUT_MS = 10 * 1000; // 10 seconds timeout for testing purposes

function pushToUserWs(userId: string, message: OutboundMessage) {
  const ws = wsConnectionMap.get(userId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.warn(
      `WebSocket for user ${userId} is not open. Unable to send message.`,
    );
  }
}

function enqueue(req: QueueRequest): void {
  const queueKey = toQueueKey(req);
  const queue = queueMap.get(queueKey);

  // If the user is already in an existing queue, do not queue the user again
  if (!canUserQueue(req.userId)) {
    pushToUserWs(req.userId, { type: "error", message: "User is already in a queue or a match." });
    return;
  }

  const enqueuedAt = Date.now();

  // Create new queue if not yet existing for this { topic-difficulty-language }
  // Add the user to the queue
  if (!queue) queueMap.set(queueKey, [{ userId: req.userId, enqueuedAt }]);
  else queue.push({ userId: req.userId, enqueuedAt });

  // Update user state to indicate they are in a queue
  userStateMap.set(req.userId, { queueKey, enqueuedAt });

  if (!canMatch(queueKey)) {
    pushToUserWs(req.userId, { type: "queued", queueKey });
    return;
  }

  // Attempt to match 2 users after enqueueing the new user
  // createMatch() pushes { type: "matched" } to both users internally on success
  if (createMatch(req) == null) {
    pushToUserWs(req.userId, { type: "queued", queueKey });
  }
}

function dequeue(queueKey: QueueKeyString): QueueEntry | null {
  const queue = queueMap.get(queueKey);
  if (!queue || queue.length === 0) {
    return null;
  }
  const matchedUser = queue.shift();
  if (queue.length === 0) {
    queueMap.delete(queueKey);
  }
  return matchedUser || null;
}

function createMatch(req: QueueRequest): Match | null {
  const queueKey = toQueueKey(req);
  const queue = queueMap.get(queueKey);
  if (!queue || queue.length < 2) return null;

  const firstEntry = queue[0];
  const secondEntry = queue[1];
  const firstUserState = userStateMap.get(firstEntry.userId);
  const secondUserState = userStateMap.get(secondEntry.userId);
  if (!firstUserState || !secondUserState) return null;

  const firstUser = dequeue(queueKey)!;
  const secondUser = dequeue(queueKey)!;

  const match: Match = {
    matchId: randomUUID(),
    users: [firstUser.userId, secondUser.userId],
    createdAt: Date.now(),
    topic: req.topic,
    difficulty: req.difficulty,
    language: req.language,
  };

  pushToUserWs(firstUser.userId, { type: "matched", match });
  pushToUserWs(secondUser.userId, { type: "matched", match });

  // Remove matched users from state and close their sockets.
  for (const userId of [firstUser.userId, secondUser.userId]) {
    removeUserFromQueue(userId);
  }

  return match;
}

function cleanupTimedOutUsers() {
  const now = Date.now();

  for (const [userId, stateInfo] of userStateMap.entries()) {
    const timeElapsedSinceEnqueue = now - stateInfo.enqueuedAt;

    // Remove queued user from queue after 2 mins and mark as timed out
    if (timeElapsedSinceEnqueue >= TIMEOUT_MS) {
      const queue = queueMap.get(stateInfo.queueKey);
      if (queue) {
        const idx = queue.findIndex((u) => u.userId === userId);
        if (idx !== -1) queue.splice(idx, 1);
        if (queue.length === 0) queueMap.delete(stateInfo.queueKey);
      }

      pushToUserWs(userId, { type: "timeout" });
      removeUserFromQueue(userId);
      console.log(
        `User ${userId} has timed out after ${TIMEOUT_MS}ms and has been removed from queue ${stateInfo.queueKey}`,
      );
    }
  }
}

function cancelMatchRequest(userId: string) {
  const userState = userStateMap.get(userId);
  if (!userState) throw new Error(`User ${userId} is not queued`);

  const queue = queueMap.get(userState.queueKey);
  if (queue) {
    const idx = queue.findIndex((u) => u.userId === userId);
    if (idx !== -1) queue.splice(idx, 1);
    if (queue.length === 0) queueMap.delete(userState.queueKey);
  }

  pushToUserWs(userId, { type: "cancelled" });
  removeUserFromQueue(userId);
  console.log(`User ${userId} has cancelled their match request and has been removed from queue ${userState.queueKey}`);
}

/**
 * ==============================
 *  HELPER FUNCTIONS
 * ==============================
 */

function canUserQueue(userId: string) {
  const userState = userStateMap.get(userId);
  // Allow queuing if no state exists, or if the previous attempt timed out
  return userState === undefined;
}

function canMatch(queueKey: QueueKeyString) {
  const queue = queueMap.get(queueKey);
  return !!queue && queue.length >= 2;
}

function removeUserFromQueue(userId: string) {
const userState = userStateMap.get(userId);
  if (!userState) return;
  const queue = queueMap.get(userState.queueKey);
  if (queue) {
    const idx = queue.findIndex((u) => u.userId === userId);
    if (idx !== -1) queue.splice(idx, 1);
    if (queue.length === 0) queueMap.delete(userState.queueKey);
  }
  userStateMap.delete(userId);
  wsConnectionMap.get(userId)?.close();
  wsConnectionMap.delete(userId);
}

export { cancelMatchRequest, cleanupTimedOutUsers, enqueue, removeUserFromQueue };

