import { z } from "zod";
import { TOPICS, DIFFICULTIES, LANGUAGES } from "../types";

export const QueueRequestSchema = z.object({
    userId: z.string().min(1),
    topic: z.enum(TOPICS),
    difficulty: z.enum(DIFFICULTIES),
    language: z.enum(LANGUAGES),
});

export const UserIdRequestSchema = z.object({
    userId: z.string().min(1),
});

export const InboundMessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("enqueue"),
        topic: z.enum(TOPICS),
        difficulty: z.enum(DIFFICULTIES),
        language: z.enum(LANGUAGES),
    }),
    z.object({
        type: z.literal("cancel"),
    }),
]);