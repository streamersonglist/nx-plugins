import { SetExecutorSchema } from './schema';
import executor from './executor';

const options: SetExecutorSchema = {};

describe('Set Executor', () => {
  it('can run', async () => {
    const output = await executor(options);
    expect(output.success).toBe(true);
  });
});