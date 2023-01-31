import { SetExecutorSchema } from './schema';

export default async function runExecutor(
  options: SetExecutorSchema,
) {
  console.log('Executor ran for Set', options);
  return {
    success: true
  };
}

