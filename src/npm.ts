import { execProcess } from './process';


export async function npmBumpPatchVersion(cwd: string): Promise<string> {
  const npmOutput = await execProcess('npm', ['version', 'patch'], { cwd });

  return npmOutput.trim().substring(1); // also remove the v in v1.0.0git status --porcelain
}
