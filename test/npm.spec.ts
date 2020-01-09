import * as fromProcess from '../src/process';
import { npmBumpPatchVersion, npmPack } from '../src/npm';

describe('npm', () => {
  let execFileAsyncSpy: jest.SpyInstance;
  let originalPlatform: string;

  beforeEach(() => {
    execFileAsyncSpy = jest.spyOn(fromProcess, 'execFileAsync')
      .mockImplementation(_ => Promise.resolve({ stdout: 'mocked-output' }) as fromProcess.ExecFileAsyncReturnType);

    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'not-windows' });
  });

  afterEach(() => {
    execFileAsyncSpy.mockRestore();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('npmBumpPatchVersion', () => {
    it('should call execFileAsync with npm on Unix platforms', async () => {
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

    it('should call execFileAsync with npm.cmd on Windows platforms', async () => {
      // arrange
      const cwd = 'dest/lib1';

      execFileAsyncSpy = jest.spyOn(fromProcess, 'execFileAsync')
        .mockImplementation(_ => Promise.resolve({ stdout: 'v1.2.3\n' }) as fromProcess.ExecFileAsyncReturnType);

      Object.defineProperty(process, 'platform', { value: 'win32' });

      // act
      const version = await npmBumpPatchVersion(cwd);

      // assert
      expect(execFileAsyncSpy).toHaveBeenCalledWith('npm.cmd', ['version', 'patch'], expect.objectContaining({
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

  describe('npmPack', () => {
    it('should call execFileAsync', async () => {
      // arrange
      const sourceDir = 'dest/lib1';
      const targetDir = 'tmp/abc123';
      const expectedTarballName = 'lib1-0.0.33.tgz';

      execFileAsyncSpy = jest.spyOn(fromProcess, 'execFileAsync')
        .mockImplementation(_ => Promise.resolve({ stdout: `\n${expectedTarballName}\n` }) as fromProcess.ExecFileAsyncReturnType);

      // act
      const version = await npmPack(sourceDir, targetDir);

      // assert
      expect(npmPack(sourceDir, targetDir)).resolves.toBe(expectedTarballName);
      expect(execFileAsyncSpy).toHaveBeenCalledWith('npm', ['pack', sourceDir], expect.objectContaining({
        cwd: targetDir,
        env: expect.anything(),
      }));

      expect(version).toBe('lib1-0.0.33.tgz');
    });
  }); // describe npmPack
}); // describe npm
