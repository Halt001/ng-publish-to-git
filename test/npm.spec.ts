import * as fromProcess from '../src/process';
import { npmBumpPatchVersion } from '../src/npm';

describe('npm', () => {
  let execFileAsyncSpy: jest.SpyInstance;

  beforeEach(() => {
    execFileAsyncSpy = jest.spyOn(fromProcess, 'execFileAsync')
      .mockImplementation(_ => Promise.resolve({ stdout: 'mocked-output' }) as fromProcess.ExecFileAsyncReturnType);
  });

  afterEach(() => {
    execFileAsyncSpy.mockRestore();
  });

  describe('npmBumpPatchVersion', () => {
    it('should call execFileAsync', async () => {
      // arrange
      const cwd = 'dest/lib1';

      execFileAsyncSpy = jest.spyOn(fromProcess, 'execFileAsync')
        .mockImplementation(_ => Promise.resolve({ stdout: 'v1.2.3\n' }) as fromProcess.ExecFileAsyncReturnType);

      // act
      const version = await npmBumpPatchVersion(cwd);

      // assert
      expect(execFileAsyncSpy).toHaveBeenCalledWith('npm', ['version', 'patch'], expect.objectContaining({
        cwd,
        env: expect.anything(),
      }));

      expect(version).toBe('1.2.3');
    });

    it ('should return rejected promise on error', () => {
      // arrange
      const cwd = 'dest/lib1';
      const error = new Error('Something went wrong');

      execFileAsyncSpy = jest.spyOn(fromProcess, 'execFileAsync')
        .mockImplementation(_ => Promise.reject(error) as any);

      // act
      const outputPromise = npmBumpPatchVersion(cwd);

      // assert
      return expect(outputPromise).rejects.toBe(error);
    });
  }); // describe npmBumpPatchVersion
}); // describe npm
