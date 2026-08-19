import tasksService from '../services/tasks.service';
import type { GetTasksFilters } from '../types/Task';
import catchAsync from '../utils/catchAsync';
import httpStatus from 'http-status';

const createTask = catchAsync(async (req, res) => {
  const { title, status } = req.body;
  const userId = req.user?.userId!;

  const task = await tasksService.createTask(title, status, userId);

  res.status(httpStatus.CREATED).json({
    success: true,
    data: task,
  });
});

const getTasks = catchAsync(async (req, res) => {
  const userId = req.user?.userId!;
  const filters = req.query as GetTasksFilters;

  // todo: add pagination
  const tasks = await tasksService.getTasks(userId, filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: tasks,
  });
});

const updateTask = catchAsync(async (req, res) => {
  const taskId = req.params.taskId as string;
  const { title, status } = req.body;
  const userId = req.user?.userId!;

  const updatedTask = await tasksService.updateTask(taskId, userId, {
    title,
    status,
  });

  res.status(httpStatus.OK).json({
    success: true,
    data: updatedTask,
  });
});

const partialUpdateTask = catchAsync(async (req, res) => {
  const taskId = req.params.taskId as string;
  const userId = req.user?.userId!;

  const updatedTask = await tasksService.partialUpdateTask(
    taskId,
    userId,
    req.body,
  );

  res.status(httpStatus.OK).json({
    success: true,
    data: updatedTask,
  });
});

const deleteTask = catchAsync(async (req, res) => {
  const taskId = req.params.taskId as string;
  const userId = req.user?.userId!;

  const deletedTask = await tasksService.deleteTask(taskId, userId);

  res.status(httpStatus.OK).json({
    success: true,
    data: deletedTask,
  });
});

const tasksController = {
  createTask,
  getTasks,
  updateTask,
  partialUpdateTask,
  deleteTask,
};

export default tasksController;
