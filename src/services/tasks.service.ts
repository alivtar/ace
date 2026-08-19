import Task from '../models/task.model';
import type { TaskStatus, UpdateTask } from '../types/Task';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';

const createTask = async (
  title: string,
  status: TaskStatus,
  userId: string,
) => {
  const task = await Task.createTask(title, status, userId);

  return task;
};

const getTasks = async (userId: string) => {
  const tasks = await Task.getTasks(userId);
  return tasks;
};

const updateTask = async (
  taskId: string,
  userId: string,
  taskData: UpdateTask,
) => {
  const updatedTask = await Task.updateTask(taskId, userId, taskData);

  if (!updatedTask) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Task not found.');
  }

  return updatedTask;
};

const partialUpdateTask = async (
  taskId: string,
  userId: string,
  partialTaskData: Partial<UpdateTask>,
) => {
  const updatedTask = await Task.partialUpdateTask(
    taskId,
    userId,
    partialTaskData,
  );

  if (!updatedTask) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Task not found.');
  }

  return updatedTask;
};

const deleteTask = async (taskId: string, userId: string) => {
  const deletedTask = await Task.deleteTask(taskId, userId);

  if (!deletedTask) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Task not found.');
  }

  return deletedTask;
};

const tasksService = {
  createTask,
  getTasks,
  updateTask,
  partialUpdateTask,
  deleteTask,
};

export default tasksService;
