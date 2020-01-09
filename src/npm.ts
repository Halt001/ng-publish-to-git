import { execProcess, isWindowsPlatform } from './process';


function npmProcessName(): string {
  return isWindowsPlatform()
    ? 'npm.cmd'
    : 'npm';
}

export async function npmBumpPatchVersion(cwd: string): Promise<string> {
  const npmOutput = await execProcess(npmProcessName(), ['version', 'patch'], { cwd });

  return npmOutput.trim().substring(1); // also remove the v in v1.0.0git status --porcelain
}

export async function npmPack(sourceDir: string, targetDir: string): Promise<string> {
  const npmOutput = await execProcess(npmProcessName(), ['pack', sourceDir], { cwd: targetDir });

  return npmOutput.trim();
}
