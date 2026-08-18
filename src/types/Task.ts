export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
};
