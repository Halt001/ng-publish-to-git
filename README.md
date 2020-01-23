# ng-publish-to-git

## Help may be added later.

For now just know that you need to add the **ng-publish-to-git** key to the main (root) package.json of your source repository and run **ng-publish-to-git** from the root directory.

```
"ng-publish-to-git": {
  "commitPrefix": "GLOBAL-PREFIX",
  "packages": [
    {
      "name": "lib1",
      "commitPrefix": "LIB1-SPECIFIC-PREFIX",
      "publish": true,
      "repositoryUrl": "https://some-repo-for-lib1-packages.git"
    },
    {
      "name": "lib2",
      "publish": true,
      "repositoryUrl": "ssh://git@some-other-repo-for-lib2-packages.git"
    },
  ]
}
```
