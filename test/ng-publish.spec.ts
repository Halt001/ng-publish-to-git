// tslint:disable: no-magic-numbers max-file-line-count
const path = require('path');
import tar from 'tar';

import { ProjectInfo } from '../src/ng-workspace';
import { ngPublishIfChanged, ngProjectGetPublishTags, splitProjectTag, makeProjectTag,
  ngProjectHasChangesSinceTag, workingDirIsClean, commit, stageFiles, stageAllAndCommit,
  tagProjectVersion, ngBuildProject, pushChangesAndTags, createTmpRepo, packIntoTmpRepo } from '../src/ng-publish';

import * as fromGit from '../src/git';
import * as fromNpm from '../src/npm';
import * as fromProcess from '../src/process';

// tslint:disable-next-line: no-duplicate-imports
import * as fromNgPublish from '../src/ng-publish';
// tslint:disable-next-line: no-duplicate-imports
import { PublishResult, PublishState } from '../src/ng-publish';

function semVerIncreasePatch(version: string): string {
  const groups = version.match(/(\d+.\d+.)(\d+)/);
  if (!groups) {
    return null;
  }

  const indexBeforePatch = 1;
  const indexPatch = 2;
  const newPatch = +groups[indexPatch] + 1;

  return groups[indexBeforePatch] + newPatch.toString();
}

describe('ng-publish', () => {
  let gitSpy: jest.SpyInstance;
  let mockGitResponse: string;

  const lib1Project: ProjectInfo = {
    projectName: 'lib1',
    projectType: 'library',
    root: 'projects/lib1',
    dest: 'dist/lib1',
    version: '1.0.0',
    publish: true,
    repositoryUrl: 'ssh://git@some-repo/lib1.git',
  };

  const lib2Project: ProjectInfo = {
    projectName: 'lib2',
    projectType: 'library',
    root: 'projects/lib2',
    dest: 'dist/lib2',
    version: '2.0.0',
    publish: true,
    repositoryUrl: 'ssh://git@some-repo/lib2.git',
  };

  beforeEach(() => {
    mockGitResponse = '';
    gitSpy = jest.spyOn(fromGit, 'git')
      .mockImplementation(_ => Promise.resolve(mockGitResponse));
  });

  afterEach(() => {
    gitSpy.mockRestore();
    mockGitResponse = '';
  });

  describe('ngPublishIfChanged', () => {
    let ngPublishSpy: jest.SpyInstance;
    let ngProjectGetPublishTagsSpy: jest.SpyInstance;
    let ngProjectHasChangesSinceTagSpy: jest.SpyInstance;
    let npmBumpPatchVersionSpy: jest.SpyInstance;
    let workingDirIsCleanSpy: jest.SpyInstance;
    let stageAllAndCommitSpy: jest.SpyInstance;
    let tagProjectVersionSpy: jest.SpyInstance;

    beforeEach(() => {
      ngPublishSpy = jest.spyOn(fromNgPublish, 'ngPublish')
        .mockImplementation(_ => Promise.resolve());

      ngProjectGetPublishTagsSpy = jest.spyOn(fromNgPublish, 'ngProjectGetPublishTags')
        .mockImplementation(_ => Promise.resolve(['lib1@v1.0.0', 'lib1@v1.0.1']));

      ngProjectHasChangesSinceTagSpy = jest.spyOn(fromNgPublish, 'ngProjectHasChangesSinceTag')
        .mockImplementation(_ => Promise.resolve(true));

      workingDirIsCleanSpy = jest.spyOn(fromNgPublish, 'workingDirIsClean')
        .mockImplementation(() => Promise.resolve(true));

      stageAllAndCommitSpy = jest.spyOn(fromNgPublish, 'stageAllAndCommit')
        .mockImplementation(() => Promise.resolve());

      npmBumpPatchVersionSpy = jest.spyOn(fromNpm, 'npmBumpPatchVersion')
        .mockImplementation(_ => Promise.resolve('1.0.1'));

      tagProjectVersionSpy = jest.spyOn(fromNgPublish, 'tagProjectVersion')
        .mockImplementation(_ => Promise.resolve());
    });

    afterEach(() => {
      ngPublishSpy.mockRestore();
      ngProjectGetPublishTagsSpy.mockRestore();
      ngProjectHasChangesSinceTagSpy.mockRestore();
      workingDirIsCleanSpy.mockRestore();
      npmBumpPatchVersionSpy.mockRestore();
      stageAllAndCommitSpy.mockRestore();
      tagProjectVersionSpy.mockRestore();
    });

    it('should reject on null projectInfo', async () => {
      // arrange
      const projectInfo: ProjectInfo = null;

      // assert
      await expect(ngPublishIfChanged(projectInfo)).rejects.toThrow('Invalid project (NULL)');
      expect(ngPublishSpy).not.toHaveBeenCalled();
    });

    it('should do noting when called with a project with publishing disabled', async () => {
      // arrange
      const projectInfo = { ...lib1Project, publish: false };

      const expectedPublishResult: PublishResult = {
        projectName: lib1Project.projectName,
        version: lib1Project.version,
        publishState: PublishState.NotPublishedDisabled,
      };

      // assert
      await expect(ngPublishIfChanged(projectInfo)).resolves.toEqual(expectedPublishResult);
      expect(ngPublishSpy).not.toHaveBeenCalled();
    });

    it('should do noting when the working directory is not clean', async () => {
      // arrange
      workingDirIsCleanSpy = jest.spyOn(fromNgPublish, 'workingDirIsClean')
        .mockImplementation(() => Promise.resolve(false));

      // assert
      await expect(ngPublishIfChanged(lib1Project)).rejects.toThrow('Working directory is not clean');
      expect(ngPublishSpy).not.toHaveBeenCalled();
    });

    it('should call ngPublish when there is no label for the current version', async () => {
      // arrange
      const version = '1.2.3';
      const projectInfo: ProjectInfo = {...lib1Project, version };

      const expectedPublishResult: PublishResult = {
        projectName: lib1Project.projectName,
        version,
        publishState: PublishState.PublishedCurrentVersion,
      };

      // assert
      await expect(ngPublishIfChanged(projectInfo)).resolves.toEqual(expectedPublishResult);
      expect(ngProjectGetPublishTagsSpy).toHaveBeenCalledWith(projectInfo.projectName);
      expect(ngPublishSpy).toHaveBeenCalledWith(projectInfo);
    });

    it('should call ngPublish when there is a label for the current version but files are changed', async () => {
      // arrange
      const version = lib1Project.version;
      const newVersion = semVerIncreasePatch(version);
      const projectInfoAfterBump: ProjectInfo = {...lib1Project, version: newVersion };
      const expectedCommitMessage = `ng-publish-to-git updated ${projectInfoAfterBump.projectName} to version v${projectInfoAfterBump.version}`;

      const expectedPublishResult: PublishResult = {
        projectName: lib1Project.projectName,
        version,
        newVersion,
        publishState: PublishState.PublishedVersionBumped,
      };

      // assert
      await expect(ngPublishIfChanged(lib1Project)).resolves.toEqual(expectedPublishResult);
      expect(ngProjectGetPublishTagsSpy).toHaveBeenCalledWith(lib1Project.projectName);
      expect(ngProjectHasChangesSinceTagSpy).toHaveBeenCalledWith(lib1Project, makeProjectTag(lib1Project.projectName, version));
      expect(npmBumpPatchVersionSpy).toHaveBeenCalledWith(lib1Project.root);
      expect(ngPublishSpy).toHaveBeenCalledWith(projectInfoAfterBump);
      expect(stageAllAndCommitSpy).toHaveBeenCalledWith(expectedCommitMessage);
    });
  }); // ngPublishIfChanged

  describe('ngPublish', () => {
    let ngBuildProjectSpy: jest.SpyInstance;
    let tagProjectVersionSpy: jest.SpyInstance;
    let pushChangesAndTagsSpy: jest.SpyInstance;
    let dirAsyncSpy: jest.SpyInstance;
    let packIntoTmpRepoSpy: jest.SpyInstance;

    beforeEach(() => {
      ngBuildProjectSpy = jest.spyOn(fromNgPublish, 'ngBuildProject')
        .mockImplementation(_ => Promise.resolve());

      tagProjectVersionSpy = jest.spyOn(fromNgPublish, 'tagProjectVersion')
        .mockImplementation(_ => Promise.resolve());

      pushChangesAndTagsSpy = jest.spyOn(fromNgPublish, 'pushChangesAndTags')
        .mockImplementation(() => Promise.resolve());

      dirAsyncSpy = jest.spyOn(fromNgPublish, 'dirAsync')
        .mockImplementation(() => Promise.resolve('./tmp'));

      packIntoTmpRepoSpy = jest.spyOn(fromNgPublish, 'packIntoTmpRepo')
        .mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
      ngBuildProjectSpy.mockRestore();
      tagProjectVersionSpy.mockRestore();
      pushChangesAndTagsSpy.mockRestore();
      dirAsyncSpy.mockRestore();
      packIntoTmpRepoSpy.mockRestore();
    });

    it('should publish', async () => {
      // arrange
      const { projectName, version } = lib1Project;

      const expectedPublishResult: PublishResult = {
        projectName,
        version,
        publishState: PublishState.PublishedCurrentVersion,
      };

      // assert
      await expect(ngPublishIfChanged(lib1Project)).resolves.toEqual(expectedPublishResult);
      expect(ngBuildProjectSpy).toHaveBeenCalledWith(projectName);
      expect(tagProjectVersionSpy).toHaveBeenCalledWith(projectName, version);
      expect(pushChangesAndTagsSpy).toHaveBeenCalled();
      expect(packIntoTmpRepoSpy).toHaveBeenCalledWith(lib1Project.dest, './tmp');
    });
  }); // describe ngPublish

  describe('packIntoTmpRepo', () => {
    let npmPackSpy: jest.SpyInstance;
    let unlinkAsyncSpy: jest.SpyInstance;
    let extractSpy: jest.SpyInstance;

    beforeEach(() => {
      npmPackSpy = jest.spyOn(fromNpm, 'npmPack')
        .mockImplementation(_ => Promise.resolve('lib1-0.0.36.tgz'));

      unlinkAsyncSpy = jest.spyOn(fromNgPublish, 'unlinkAsync')
        .mockImplementation(_ => Promise.resolve());

      extractSpy = jest.spyOn(tar, 'extract')
        .mockImplementation(_ => Promise.resolve());
    });

    afterEach(() => {
      npmPackSpy.mockRestore();
      unlinkAsyncSpy.mockRestore();
      extractSpy.mockRestore();
    });

    it('should call npm pack', async () => {
      // arrange
      const repoDir = 'tmp/abc123';
      const packageDir = 'dist/lib1';
      const expectedAbsolutePackageDir = path.resolve('dist/lib1');
      const expectedTarballNameAbsolute = path.resolve(repoDir, 'lib1-0.0.36.tgz');

      const expectedExtractOptions: tar.ExtractOptions & tar.FileOptions = {
        strip: 1,
        cwd: repoDir,
        file: expectedTarballNameAbsolute,
      };

      // assert
      await expect(packIntoTmpRepo(packageDir, repoDir)).resolves.toBeUndefined();

      expect(npmPackSpy).toHaveBeenCalledWith(expectedAbsolutePackageDir, repoDir);
      expect(extractSpy).toHaveBeenCalledWith(expectedExtractOptions);
      expect(unlinkAsyncSpy).toHaveBeenCalledWith(expectedTarballNameAbsolute);
    });
  }); // describe packIntoTmpRepo

  describe('workingDirIsClean', () => {
    it('should return false when git status shows changes', async () => {
      mockGitResponse = '\nM some-file.ts\n';

      await expect(workingDirIsClean()).resolves.toBe(false);
      expect(gitSpy).toBeCalledWith(['status', '--porcelain']);
    });

    it('should return true when git status shows changes', async () => {
      mockGitResponse = '\n\n';

      await expect(workingDirIsClean()).resolves.toBe(true);
      expect(gitSpy).toBeCalledWith(['status', '--porcelain']);
    });
  }); // describe workingDirIsClean

  describe('commit', () => {
    it('should call git commit with message', async () => {
      // arrange
      const commitMessage = 'WIP';
      mockGitResponse = '\n3 files changed, 26 insertions(+), 4 deletions(-)\n';

      // assert
      await expect(commit(commitMessage)).resolves.toBeUndefined();
      expect(gitSpy).toBeCalledWith(['commit', '-m', commitMessage]);
    });
  }); // describe commit

  describe('createTmpRepo', () => {
    let dirAsyncSpy: jest.SpyInstance;

    beforeEach(() => {
      dirAsyncSpy = jest.spyOn(fromNgPublish, 'dirAsync')
        .mockImplementation(() => Promise.resolve('./tmp'));
    });

    afterEach(() => {
      dirAsyncSpy.mockRestore();
    });

    it('should initialize a new repo in a tmp directory', async () => {
      // arrange
      const expectedTmpDir = './tmp';
      const repositoryUrl = 'https://some-repo.git';

      // assert
      await expect(createTmpRepo(repositoryUrl)).resolves.toBe(expectedTmpDir);
      expect(gitSpy).toHaveBeenNthCalledWith(1, ['init'], expectedTmpDir);
      expect(gitSpy).toHaveBeenNthCalledWith(2, ['remote', 'add', 'package-repo', repositoryUrl], expectedTmpDir);
    });
  }); // describe createTmpRepo

  describe('stageFiles', () => {
    it('should call git add fileSpec', async () => {
      // arrange
      const fileSpec = 'someFiles';

      // assert
      await expect(stageFiles(fileSpec)).resolves.toBeUndefined();
      expect(gitSpy).toBeCalledWith(['add', fileSpec]);
    });
  }); // describe stageFiles

  describe('stageAllAndCommit', () => {
    it('should call git add fileSpec', async () => {
      // arrange
      const commitMessage = 'WIP';

      // assert
      await expect(stageAllAndCommit(commitMessage)).resolves.toBeUndefined();
      expect(gitSpy).toHaveBeenNthCalledWith(1, ['add', '.']);
      expect(gitSpy).toHaveBeenNthCalledWith(2, ['commit', '-m', commitMessage]);
    });
  }); // describe stageAllAndCommit

  describe('tagProjectVersion', () => {
    it('should call git tag with the project tag', async () => {
      // arrange
      const projectName = 'lib1';
      const version = '1.0.24';
      const expectedProjectTag = 'lib1@v1.0.24';

      // assert
      await expect(tagProjectVersion(projectName, version)).resolves.toBeUndefined();
      expect(gitSpy).toHaveBeenCalledWith(['tag', expectedProjectTag, '-m', `ng-publish-to-git tagged ${projectName} with ${version}`]);
    });
  }); // describe tagProjectVersion'

  describe('pushChangesAndTags', () => {
    it('should call git tag with the project tag', async () => {
      // assert
      await expect(pushChangesAndTags()).resolves.toBeUndefined();
      expect(gitSpy).toHaveBeenCalledWith(['push', '--follow-tags']);
    });
  }); // describe pushChangesAndTags

  describe('ngBuildProject', () => {
    let execProcessSpy: jest.SpyInstance;
    let originalPlatform: string;

    beforeEach(() => {
      execProcessSpy = jest.spyOn(fromProcess, 'execProcess')
        .mockImplementation(_ => Promise.resolve('mocked-output'));

      originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'not-windows',
      });
    });

    afterEach(() => {
      execProcessSpy.mockRestore();
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should call ng build with the project name', async () => {
      // arrange
      const projectName = 'lib1';

      // assert
      await expect(ngBuildProject(projectName)).resolves.toBeUndefined();
      expect(execProcessSpy).toHaveBeenCalledWith('ng', ['build', projectName], { verbose: false });
    });

    it('should call ng build using ng.cmd on windows with the project name', async () => {
      // arrange
      const projectName = 'lib1';

      Object.defineProperty(process, 'platform', { value: 'win32', });

      // assert
      await expect(ngBuildProject(projectName)).resolves.toBeUndefined();
      expect(execProcessSpy).toHaveBeenCalledWith('ng.cmd', ['build', projectName], { verbose: false });
    });
  }); // describe ngBuildProject'

  describe('ngGetPublishTags', () => {
    it ('should call git and return the tags', async () => {
      // arrange
      mockGitResponse = 'lib1@v1.2.0\nlib2@v3.0.1\nlib1@v2.1.0\n';

      // assert
      await expect(ngProjectGetPublishTags('lib1')).resolves.toEqual(['lib1@v1.2.0', 'lib1@v2.1.0']);
      await expect(ngProjectGetPublishTags('lib2')).resolves.toEqual(['lib2@v3.0.1']);
    });

    it ('should return an empty array if no tags are found', async () => {
      // arrange
      mockGitResponse = '\n';

      // assert
      await expect(ngProjectGetPublishTags('lib1')).resolves.toEqual([]);
    });

    it ('should reject if git fails', async () => {
      // arrange
      gitSpy = jest.spyOn(fromGit, 'git').mockImplementation(_ => Promise.reject(new Error('Git error')));

      // assert
      await expect(ngProjectGetPublishTags('lib1')).rejects.toThrow('Git error');
    });
  }); // describe ngGetPublishTags

  describe('makeProjectTag', () => {
    it ('should make a project tag', () => {
      expect(makeProjectTag('lib1', '1.0.0')).toBe('lib1@v1.0.0');
      expect(makeProjectTag('lib1@', '1.0.0')).toBe('lib1@@v1.0.0');
      expect(makeProjectTag('lib1@foo', '1.0.0')).toBe('lib1@foo@v1.0.0');
    });
  }); // describe makeProjectTag

  describe('splitProjectTag', () => {
    it ('should split valid tags', () => {
      expect(splitProjectTag('lib1@v1.0.0')).toEqual({ projectName: 'lib1', version: '1.0.0' });
      expect(splitProjectTag('foo@bar@v1.2.3')).toEqual({ projectName: 'foo@bar', version: '1.2.3' });
    });

    it ('should return null for invalid tags', () => {
      expect(splitProjectTag('@v1.0.0')).toBeNull();
      expect(splitProjectTag('lib1@1.2.3')).toBeNull();
      expect(splitProjectTag('@1.2.3')).toBeNull();
      expect(splitProjectTag('lib1')).toBeNull();
      expect(splitProjectTag('lib1@')).toBeNull();
      expect(splitProjectTag('lib1@v')).toBeNull();
      expect(splitProjectTag('lib1@v1')).toBeNull();
      expect(splitProjectTag('lib1@v1.')).toBeNull();
      expect(splitProjectTag('lib1@v1.0')).toBeNull();
      expect(splitProjectTag('lib1@v1.0.')).toBeNull();
      expect(splitProjectTag('lib1.2.3')).toBeNull();
      expect(splitProjectTag('lib1@v1.0')).toBeNull();
      expect(splitProjectTag('')).toBeNull();
    });
  }); // describe splitProjectTag

  describe('ngProjectHasChangesSinceTag', () => {
    it ('should return true when there are changed files', async () => {
      // arrange
      const sinceTag = makeProjectTag('lib1', '1.0.0');

      mockGitResponse = 'projects/lib1\some-file\n';

      // act
      const projectHasChanges = await ngProjectHasChangesSinceTag(lib1Project, sinceTag);

      // assert
      expect(gitSpy).toHaveBeenCalledWith(['diff', '--name-only', sinceTag, '--', lib1Project.root]);
      expect(projectHasChanges).toBe(true);
    });

    it ('should return false when there are no changed files', async () => {
      // arrange
      const sinceTag = makeProjectTag('lib1', '1.0.0');

      mockGitResponse = '\n';

      // act
      const projectHasChanges = await ngProjectHasChangesSinceTag(lib1Project, sinceTag);

      // assert
      expect(gitSpy).toHaveBeenCalledWith(['diff', '--name-only', sinceTag, '--', lib1Project.root]);
      expect(projectHasChanges).toBe(false);
    });

    it ('should reject when git fails', async () => {
      // arrange
      const sinceTag = makeProjectTag('lib1', '1.0.0');

      mockGitResponse = '\n';

      // arrange
      gitSpy = jest.spyOn(fromGit, 'git').mockImplementation(_ => Promise.reject(new Error('Git error')));

      // assert
      await expect(ngProjectHasChangesSinceTag(lib1Project, sinceTag)).rejects.toThrow('Git error');
    });
  });
}); // describe ng-publish
