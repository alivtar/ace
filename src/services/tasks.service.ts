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

const getTasks = async () => {
  const tasks = await Task.getTasks();
  return tasks;
};

const tasksService = { createTask, getTasks };

export default tasksService;
