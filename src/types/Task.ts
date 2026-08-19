import { TASK_STATUSES } from '../constants/tasks.constants';

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
};

export type GetTasksFilters = {
  search?: string;
  status?: TaskStatus;
};

export type UpdateTask = {
  title: string;
  status: TaskStatus;
};
