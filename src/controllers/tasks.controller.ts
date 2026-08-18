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
  const tasks = await tasksService.getTasks();

  res.status(200).json({
    success: true,
    data: tasks,
  });
});

const tasksController = {
  createTask,
  getTasks,
};

export default tasksController;
