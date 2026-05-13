import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const TEST_ROOT_DIR = path.join(SRC_DIR, 'test');

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx)$/;
const RELATIVE_SPECIFIER_PATTERN = [
  /(from\s*['"])(\.\.?[^'"]*)(['"])/g,
  /(import\s*\(\s*['"])(\.\.?[^'"]*)(['"]\s*\))/g,
  /(require\s*\(\s*['"])(\.\.?[^'"]*)(['"]\s*\))/g,
  /(vi\.(?:mock|doMock|unmock)\s*\(\s*['"])(\.\.?[^'"]*)(['"])/g,
];

function isTestFile(filePath) {
  return TEST_FILE_PATTERN.test(filePath);
}

function isInTestRoot(filePath) {
  return filePath === TEST_ROOT_DIR || filePath.startsWith(`${TEST_ROOT_DIR}${path.sep}`);
}

function toPosixPath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function rewriteRelativeSpecifier(oldFilePath, newFilePath, specifier) {
  if (!specifier.startsWith('.')) return specifier;

  const oldResolvedPath = path.resolve(path.dirname(oldFilePath), specifier);
  let nextSpecifier = path.relative(path.dirname(newFilePath), oldResolvedPath);
  nextSpecifier = toPosixPath(nextSpecifier);

  if (!nextSpecifier.startsWith('.')) {
    nextSpecifier = `./${nextSpecifier}`;
  }

  return nextSpecifier;
}

function rewriteAllRelativeSpecifiers(rawContent, oldFilePath, newFilePath) {
  let content = rawContent;

  for (const pattern of RELATIVE_SPECIFIER_PATTERN) {
    content = content.replace(pattern, (_, prefix, specifier, suffix) => {
      const rewrittenSpecifier = rewriteRelativeSpecifier(oldFilePath, newFilePath, specifier);
      return `${prefix}${rewrittenSpecifier}${suffix}`;
    });
  }

  return content;
}

async function collectFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (isInTestRoot(absPath)) {
        continue;
      }

      files.push(...(await collectFiles(absPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absPath);
    }
  }

  return files;
}

function getTargetPath(sourcePath) {
  const relativeFromSrc = path.relative(SRC_DIR, sourcePath);
  return path.join(TEST_ROOT_DIR, relativeFromSrc);
}

async function relocateTests() {
  const allFiles = await collectFiles(SRC_DIR);
  const testFiles = allFiles.filter((filePath) => isTestFile(filePath));
  const movePairs = testFiles.map((sourcePath) => ({
    sourcePath,
    targetPath: getTargetPath(sourcePath),
  }));

  // 先写入新文件再删旧文件，确保中途失败时不丢测试内容。
  for (const { sourcePath, targetPath } of movePairs) {
    const raw = await fs.readFile(sourcePath, 'utf8');
    const rewritten = rewriteAllRelativeSpecifiers(raw, sourcePath, targetPath);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rewritten, 'utf8');
  }

  for (const { sourcePath } of movePairs) {
    await fs.unlink(sourcePath);
  }

  console.log(`relocated ${movePairs.length} test files to src/test`);
}

relocateTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
