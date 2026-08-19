import tasksService from '../services/tasks.service';
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
  // todo: enable filters for `title` and `status`
  // todo: add pagination
  const tasks = await tasksService.getTasks();

  res.status(200).json({
    success: true,
    data: tasks,
  });
});

const updateTask = catchAsync(async (req, res) => {
  const taskId = req.params.taskId as string;
  const { title, status } = req.body;

  const updatedTask = await tasksService.updateTask(taskId, { title, status });

  res.status(httpStatus.OK).json({
    success: true,
    data: updatedTask,
  });
});

const tasksController = {
  createTask,
  getTasks,
  updateTask,
};

export default tasksController;
