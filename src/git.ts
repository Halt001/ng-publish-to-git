import { execProcess } from './process';


export function git(args: string[], cwd: string = './', verbose: boolean = false): Promise<string> {
  return execProcess('git', args, { cwd, verbose });
}
