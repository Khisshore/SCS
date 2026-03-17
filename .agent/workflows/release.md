---
description: Release a new version — bumps version, commits, tags, pushes, and triggers GitHub Actions to build + publish the installer automatically.
---

# Release Workflow

// turbo-all

This workflow automates the entire release process. After running, GitHub Actions will build the `.exe` installer and publish it as a GitHub Release. Users will get the update automatically.

## Steps

1. Delete any temporary/scratch files that shouldn't be committed:
```
del /f /q fix_syntax.js 2>nul
```

2. Stage all changes:
```
git add -A
```

3. Read the current version from package.json and compute the next patch version. Then bump it:
```
node -e "const pkg=require('./package.json'); const v=pkg.version.split('.'); v[2]=parseInt(v[2])+1; pkg.version=v.join('.'); require('fs').writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n'); console.log('Bumped to '+pkg.version);"
```

4. Stage the version bump:
```
git add package.json

```

5. Commit with the new version (read version from package.json):
```
node -e "const v=require('./package.json').version; const {execSync}=require('child_process'); execSync('git commit -m \"Release v'+v+'\"', {stdio:'inherit'});"
```

6. Create the git tag:
```
node -e "const v=require('./package.json').version; const {execSync}=require('child_process'); execSync('git tag v'+v, {stdio:'inherit'});"
```

7. Push commit and tag to GitHub (this triggers the CI/CD build):
```
git push origin main --tags
```

8. After pushing, tell the user to check GitHub Actions at https://github.com/Khisshore/SCS/actions for the build status. The release will appear at https://github.com/Khisshore/SCS/releases once the build completes (~5-10 minutes).