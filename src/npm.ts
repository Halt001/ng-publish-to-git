import { execProcess } from './process';


export async function npmBumpPatchVersion(cwd: string): Promise<string> {
  const npmOutput = await execProcess('npm', ['version', 'patch'], { cwd });

  return npmOutput.trim().substring(1); // also remove the v in v1.0.0git status --porcelain
}

export async function npmPack(sourceDir: string, targetDir: string): Promise<string> {
  console.log('npmPack params', sourceDir, targetDir);

  const npmOutput = await execProcess('npm', ['pack', sourceDir], { cwd: targetDir });

  return npmOutput.trim();
}
