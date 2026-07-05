import { z } from 'zod';

export const playerRoleSchema = z.enum(['beat_tapper', 'vocalist', 'hype_captain']);

export const beatmapNoteSchema = z.object({
  id: z.string(),
  timeMs: z.number().min(0),
  type: z.enum(['tap', 'hold', 'swipe']),
  role: playerRoleSchema,
  durationMs: z.number().min(0).optional(),
});

export const vocalPromptSchema = z.object({
  id: z.string(),
  timeMs: z.number().min(0),
  text: z.string().min(1),
  durationMs: z.number().min(100),
});

export const hypeEventSchema = z.object({
  id: z.string(),
  timeMs: z.number().min(0),
  type: z.enum(['cheer', 'lights', 'boost', 'combo_save']),
});

export const beatmapSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  startMs: z.number().min(0),
  endMs: z.number().min(0),
});

export const beatmapSchema = z.object({
  id: z.string(),
  songId: z.string(),
  version: z.string(),
  bpm: z.number().positive(),
  offsetMs: z.number(),
  durationMs: z.number().positive(),
  difficulty: z.enum(['beginner', 'casual', 'pro', 'nightmare']),
  licenseStatus: z.string(),
  sections: z.array(beatmapSectionSchema),
  notes: z.array(beatmapNoteSchema),
  vocalPrompts: z.array(vocalPromptSchema),
  hypeEvents: z.array(hypeEventSchema),
});

export type BeatmapSchema = z.infer<typeof beatmapSchema>;

export function validateBeatmap(data: unknown): {
  success: boolean;
  data?: BeatmapSchema;
  errors?: string[];
} {
  const result = beatmapSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

export function generateRoomCode(length = 5): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function sanitizePlayerName(name: string): string {
  return name
    .trim()
    .slice(0, 20)
    .replace(/[<>"'&]/g, '')
    .replace(/\s+/g, ' ');
}
