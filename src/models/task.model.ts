import logger from '../configs/logger.js';
import pool from '../db/pool.js';
import type { TaskRow, TaskStatus, UpdateTask } from '../types/Task.js';

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

const updateTask = async (taskId: string, taskData: UpdateTask) => {
  const result = await pool.query<TaskRow>(
    `
        UPDATE support_tasks
        SET
            title = $1,
            status = $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
    `,
    [taskData.title, taskData.status, taskId],
  );

  return result.rows[0];
};

const partialUpdateTask = async (
  taskId: string,
  partialTaskData: Partial<UpdateTask>,
) => {
  const setClauseValues = Object.values(partialTaskData);

  const setClauseItems = Object.entries(partialTaskData).map((item, idx) => {
    return `${item[0]} = $${idx + 1}`;
  });

  const setClause = setClauseItems.join(', ');

  const result = await pool.query<TaskRow>(
    `
        UPDATE support_tasks
        SET
            ${setClause},
            updated_at = NOW()
        WHERE id = $${setClauseItems.length + 1}
        RETURNING *
    `,
    [...setClauseValues, taskId],
  );

  return result.rows[0];
};

const Task = {
  createTask,
  getTasks,
  updateTask,
  partialUpdateTask,
};

export default Task;
