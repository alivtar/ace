import pool from '../db/pool.js';
import type { TaskRow, TaskStatus } from '../types/Task.js';

const createTask = async (
  title: string,
  status: TaskStatus,
  userId: string,
): Promise<TaskRow> => {
  const result = await pool.query<TaskRow>(
    `
        INSERT INTO support_tasks (title, status, user_id)
        VALUES ($1, $2, $3)
        RETURNING *
    `,
    [title, status, userId],
  );

  return result.rows[0];
};

const getTasks = async () => {
  const result = await pool.query<TaskRow>(
    `
        SELECT * FROM support_tasks
    `,
  );

  return result.rows;
};

const Task = {
  createTask,
  getTasks,
};

export default Task;
