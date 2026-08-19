import Task from '../models/task.model';
import type { TaskStatus, UpdateTask } from '../types/Task';

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

const updateTask = async (taskId: string, taskData: UpdateTask) => {
  const updatedTask = await Task.updateTask(taskId, taskData);
  return updatedTask;
};

const partialUpdateTask = async (
  taskId: string,
  partialTaskData: Partial<UpdateTask>,
) => {
  const updatedTask = await Task.partialUpdateTask(taskId, partialTaskData);
  return updatedTask;
};

const tasksService = { createTask, getTasks, updateTask, partialUpdateTask };

export default tasksService;
