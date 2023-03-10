import { GetExecutorSchema } from './schema';
import executor from './executor';

const options: GetExecutorSchema = {};

describe('Get Executor', () => {
  it('can run', async () => {
    const output = await executor(options);
    expect(output.success).toBe(true);
  });
});