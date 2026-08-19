import type { TaskStatus } from '../types/Task';

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export const DEFAULT_TASK_STATUS: TaskStatus = 'OPEN';

export const TASK_TITLE_MIN_LENGTH = 150;
