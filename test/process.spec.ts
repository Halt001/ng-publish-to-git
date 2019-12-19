// jest.mock('../src/utils');
import * as fromProcess from '../src/process';
import * as fromEvents from 'events';

class ChildProcessMock extends fromEvents.EventEmitter {
  stdout = new fromEvents.EventEmitter();
  stderr = new fromEvents.EventEmitter();
}

const childProcessMock = new ChildProcessMock();

jest.mock('child_process', () => {
  const originalModule = jest.requireActual('child_process');

  return {
    __esModule: true,
    ...originalModule,
    spawn: jest.fn(_ => childProcessMock),
  };
});

import * as childProcess from 'child_process';


describe('utils', () => {
  let execFileAsyncSpy: jest.SpyInstance;

  beforeEach(() => {
    execFileAsyncSpy = jest.spyOn(fromProcess, 'execFileAsync')
      .mockImplementation(_ => Promise.resolve({ stdout: 'mocked-output' }) as fromProcess.ExecFileAsyncReturnType);
  });

  afterEach(() => {
    execFileAsyncSpy.mockRestore();
    (childProcess.spawn as any).mockClear();
  });

  describe('execProcess', () => {
    describe('verbose mode', () => {
      it ('should call spawn when called with verbose = true', async () => {
        // act
        const outputPromise = fromProcess.execProcess('some-process-name', [], { verbose: true });

        childProcessMock.emit('exit', 0);

        await outputPromise;

        // assert
        expect(execFileAsyncSpy).not.toHaveBeenCalled();
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it ('should call spawn with given environment, arguments and options', async () => {
        // arrange
        const processName = 'some-process-name';
        const args: string[] = [];
        const env = { path: 'some-path' };
        const options = { verbose: true, env, cwd: './' };
        const expectedExecProcessOptions = {
          env: {
            path: 'some-path',
          },
          cwd: './',
          stdio: [ 'inherit', 'pipe', 'inherit' ],
        };

        // act
        const outputPromise = fromProcess.execProcess(processName, args, options);

        childProcessMock.emit('exit', 0);

        await outputPromise;

        // assert
        expect(execFileAsyncSpy).not.toHaveBeenCalled();
        expect(childProcess.spawn).toHaveBeenCalledWith(processName, args, expectedExecProcessOptions);
      });
    }); // describe verbose mode

    describe('silent mode', () => {
      it ('should call execFileAsync when called with default options', async () => {
        // arrange
        const processName = 'some-process-name';
        const args: string[] = [];
        const expectedExecProcessOptions = { env: process.env };

        // act
        await fromProcess.execProcess(processName);

        // assert
        expect(execFileAsyncSpy).toHaveBeenCalledWith(processName, args, expectedExecProcessOptions);
        expect(childProcess.spawn).not.toHaveBeenCalled();
      });

      it ('should call execFileAsync with given environment, arguments and options', async () => {
        // arrange
        const processName = 'some-process-name';
        const args: string[] = ['-v', '-g'];
        const env = { path: 'some-path' };
        const cwd = './';
        const options = { verbose: false, env, cwd };
        const expectedExecProcessOptions = {
          env,
          cwd,
        };

        // act
        const output = await  fromProcess.execProcess(processName, args, options);

        // assert
        expect(execFileAsyncSpy).toHaveBeenCalledWith(processName, args, expectedExecProcessOptions);
        expect(output).toBe('mocked-output');
      });

      it ('should return rejected promise on error', () => {
        // arrange
        const error = new Error('Something went wrong');

        execFileAsyncSpy = jest.spyOn(fromProcess, 'execFileAsync')
          .mockImplementation(_ => Promise.reject(error) as any);

        // act
        const outputPromise = fromProcess.execProcess('some-process-name');

        // assert
        return expect(outputPromise).rejects.toBe(error);
      });
    }); //  describe silent mode
  }); // describe execProcess
}); // describe utils
