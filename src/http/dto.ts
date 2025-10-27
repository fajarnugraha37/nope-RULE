import { z } from 'zod';

const JsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(JsonValue)])
);

export const StartWorkflowBody = JsonValue;

export const WorkflowUploadBody = JsonValue;

export const TaskSubmitBody = JsonValue;

export const EventBody = JsonValue;

export const TaskQuery = z.object({
  assignee: z.string().min(1)
});

export const PathWithId = z.object({
  id: z.string().min(1)
});

export const EventPath = z.object({
  topic: z.string().min(1),
  key: z.string().min(1)
});
