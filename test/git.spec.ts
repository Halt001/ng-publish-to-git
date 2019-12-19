import * as fromProcess from '../src/process';
import { git } from '../src/git';


describe('git', () => {
  let execFileAsyncSpy: jest.SpyInstance;

  beforeEach(() => {
    execFileAsyncSpy = jest.spyOn(fromProcess, 'execFileAsync')
      .mockImplementation(_ => Promise.resolve({ stdout: 'mocked-output' }) as fromProcess.ExecFileAsyncReturnType);
  });

  afterEach(() => {
    execFileAsyncSpy.mockRestore();
  });

  describe('git', () => {
    it ('should call execFileAsync with default parameters', async () => {
      // act
      await git(['init']);

      // assert
      expect(execFileAsyncSpy).toHaveBeenCalledWith('git', ['init'], expect.objectContaining({
        cwd: './',
        env: expect.anything(),
      }));
    });

    it ('should call execFileAsync with cwd', async () => {
      // arrange
      const cwd = './some-folder';

      // act
      await git(['init'], cwd);

      // assert
      expect(execFileAsyncSpy).toHaveBeenCalledWith('git', ['init'], expect.objectContaining({
        cwd,
        env: expect.anything(),
      }));
    });
  }); // describe gitInit
}); // describe git
