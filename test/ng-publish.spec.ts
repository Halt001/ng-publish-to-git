import { ProjectInfo } from '../src/ng-workspace';
import { ngPublishIfChanged, ngProjectGetPublishTags, splitProjectTag, makeProjectTag,
  ngProjectHasChangesSinceTag,
  workingDirIsClean} from '../src/ng-publish';

import * as fromGit from '../src/git';
import * as fromNpm from '../src/npm';


// tslint:disable-next-line: no-duplicate-imports
import * as fromNgPublish from '../src/ng-publish';

describe('ng-publish', () => {
  let gitSpy: jest.SpyInstance;
  let mockGitResponse: string;

  const lib1Project: ProjectInfo = {
    name: 'lib1',
    projectType: 'library',
    root: 'projects/lib1',
    dest: 'dist/lib1',
    version: '1.0.0',
    publish: true,
    repositoryUrl: 'ssh://git@some-repo/lib1.git',
  };

  const lib2Project: ProjectInfo = {
    name: 'lib2',
    projectType: 'library',
    root: 'projects/lib2',
    dest: 'dist/lib2',
    version: '2.0.0',
    publish: true,
    repositoryUrl: 'ssh://git@some-repo/lib2.git',
  };

  beforeEach(() => {
    mockGitResponse = '';
    gitSpy = jest.spyOn(fromGit, 'git').mockImplementation(_ => Promise.resolve(mockGitResponse));
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

    beforeEach(() => {
      ngPublishSpy = jest.spyOn(fromNgPublish, 'ngPublish')
        .mockImplementation(_ => Promise.resolve('mock-ng-publish-output'));

      ngProjectGetPublishTagsSpy = jest.spyOn(fromNgPublish, 'ngProjectGetPublishTags')
        .mockImplementation(_ => Promise.resolve(['lib1@v1.0.0', 'lib1@v1.0.1']));

      ngProjectHasChangesSinceTagSpy = jest.spyOn(fromNgPublish, 'ngProjectHasChangesSinceTag')
        .mockImplementation(_ => Promise.resolve(true));

      npmBumpPatchVersionSpy = jest.spyOn(fromNpm, 'npmBumpPatchVersion')
        .mockImplementation(_ => Promise.resolve('1.0.1'));
    });

    afterEach(() => {
      ngPublishSpy.mockRestore();
      ngProjectGetPublishTagsSpy.mockRestore();
      ngProjectHasChangesSinceTagSpy.mockRestore();
      npmBumpPatchVersionSpy.mockRestore();
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

      // assert
      await expect(ngPublishIfChanged(projectInfo)).rejects.toThrow('Project lib1 has publish disabled');
      expect(ngPublishSpy).not.toHaveBeenCalled();
    });

    it('should call ngPublish when there is no label for the current version', async () => {
      // arrange
      const projectInfo: ProjectInfo = {...lib1Project, version: '999.999.999' };

      // assert
      await expect(ngPublishIfChanged(projectInfo)).resolves.toBe('mock-ng-publish-output');
      expect(ngProjectGetPublishTagsSpy).toHaveBeenCalledWith(projectInfo.name);
      expect(ngPublishSpy).toHaveBeenCalledWith(projectInfo);
    });

    it('should call ngPublish when there is a label for the current version but files are changed', async () => {
      // arrange
      const projectInfo: ProjectInfo = {...lib1Project, version: '1.0.0' };
      const projectInfoAfterBump: ProjectInfo = {...projectInfo, version: '1.0.1' };

      // assert
      await expect(ngPublishIfChanged(projectInfo)).resolves.toBe('mock-ng-publish-output');
      expect(ngProjectGetPublishTagsSpy).toHaveBeenCalledWith(projectInfo.name);
      expect(ngProjectHasChangesSinceTagSpy).toHaveBeenCalledWith(projectInfo, makeProjectTag(projectInfo.name, projectInfo.version));
      expect(npmBumpPatchVersionSpy).toHaveBeenCalledWith(projectInfo.dest);
      expect(ngPublishSpy).toHaveBeenCalledWith(projectInfoAfterBump);
    });
  }); // ngPublishIfChanged

  // describe('semVerIncreasePatch', () => {
  //   it('should increase the patch version', () => {
  //     expect(semVerIncreasePatch('0.0.0')).toBe('0.0.1');
  //     expect(semVerIncreasePatch('0.1.0')).toBe('0.1.1');
  //     expect(semVerIncreasePatch('1.0.0')).toBe('1.0.1');
  //     expect(semVerIncreasePatch('1.0.')).toBe(null);
  //   });
  // }); // describe semVerIncreasePatch

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
  });

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
  }); // splitProjectTag

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
