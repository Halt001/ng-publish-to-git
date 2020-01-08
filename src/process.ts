// import { Promise, promisify } from 'bluebird';
import { execFile, spawn, SpawnOptions, ExecFileOptions } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

export interface ExecProcessOptions {
  cwd?: string;
  verbose?: boolean;
  env?: { [index: string]: string };
}

export const execFileAsync = promisify(execFile);
export type ExecFileAsyncReturnType = ReturnType<typeof execFileAsync>;

export function execProcess(processName: string, args: string[] = [], options: ExecProcessOptions = {}): Promise<string> {
  const consoleOutput = chalk.dim('Executing: ') + processName + ' ' + args.join(' ') + chalk.dim(' with cwd: ') + (options.cwd || '.');

  // tslint:disable-next-line: no-console
  console.log(consoleOutput);

  return options && options.verbose
    ? execProcessVerbose(processName, args, options)
    : execProcessSilent(processName, args, options);
}

async function execProcessSilent(processName: string, args: string[], options: ExecProcessOptions): Promise<string> {
  const { cwd } = options;
  const env = options.env || process.env;

  const execFileOptions: ExecFileOptions = {
    ...(cwd && { cwd }),
    env,
  };

  const { stdout } = await execFileAsync(processName, args, execFileOptions);

  return stdout;
}

function execProcessVerbose(processName: string, args: string[], options: ExecProcessOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const { cwd } = options;
    const env = options.env || process.env;

    const spawnFileOptions: SpawnOptions = {
      ...(cwd && { cwd }),
      stdio: ['inherit', 'pipe', 'inherit'],
      env,
    };

    const onStdoutDataFn = (data: Buffer) => output += data.toString('utf8');

    const onExitFn = (exitCode: number) => exitCode === 0
      ? resolve(output)
      : reject(new Error(`${processName} failed with error code ${exitCode}`));

    const onErrorFn = (error: any) => {
      reject(error);
    };

    spawn(processName, args, spawnFileOptions)
      .on('exit', onExitFn)
      .on('error', onErrorFn)
      .stdout.on('data', onStdoutDataFn);
  });
}
