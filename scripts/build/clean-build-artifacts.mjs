import { existsSync, rmSync } from 'node:fs';

const targets = ['.next', 'tsconfig.tsbuildinfo', 'tsconfig.typecheck.tsbuildinfo'];

for (const target of targets) {
  if (!existsSync(target)) {
    continue;
  }

  // 构建前清理旧产物，避免缓存污染影响产物体积与排障定位。
  rmSync(target, { recursive: true, force: true });
}
