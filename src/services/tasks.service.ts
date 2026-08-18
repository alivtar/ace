import Task from '../models/task.model';
import type { TaskStatus } from '../types/Task';

const createTask = async (
  title: string,
  status: TaskStatus,
  userId: string,
) => {
  const task = await Task.createTask(title, status, userId);

  return task;
};

const tasksService = { createTask };

export default tasksService;
