#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const currentVersion = packageJson.version;
const args = process.argv.slice(2);
const versionArg = args[0] || 'patch';

// 检查是否有未暂存的文件
const checkUnstagedChanges = () => {
  try {
    const status = execSync('git status --porcelain').toString();
    return status.trim() !== '';
  } catch (error) {
    console.warn('无法检查git状态，继续执行...');
    return false;
  }
};

// 获取用户输入的Promise函数
const getUserInput = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// 确保serverless目录存在
const serverlessDir = path.join(__dirname, '..', 'serverless');
if (!fs.existsSync(serverlessDir)) {
  fs.mkdirSync(serverlessDir, { recursive: true });
  console.log('创建 serverless 目录');
}

// 主程序
const main = async () => {
  // 检查未暂存的文件
  if (checkUnstagedChanges()) {
    console.log('\n');
    console.log('🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨');
    console.log('🚨                                              🚨');
    console.log('🚨    警告: 您有未暂存或未提交的文件更改！    🚨');
    console.log('🚨                                              🚨');
    console.log('🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨');
    console.log('\n请检查以下变更:');
    
    execSync('git status', { stdio: 'inherit' });
    
    const answer = await getUserInput('\n是否要先暂存这些更改? (y/n): ');
    if (answer.toLowerCase() === 'y') {
      try {
        execSync('git add .', { stdio: 'inherit' });
        console.log('✅ 已暂存所有更改');
      } catch (error) {
        console.error('暂存更改失败:', error);
        process.exit(1);
      }
    } else if (answer.toLowerCase() !== 'n') {
      console.log('❌ 发布取消');
      process.exit(0);
    }
  }

  // 更新版本
  console.log(`当前版本: ${currentVersion}`);
  execSync(`npm version ${versionArg} --no-git-tag-version`, { stdio: 'inherit' });

  // 读取新版本
  const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const newVersion = updatedPackageJson.version;
  console.log(`新版本: ${newVersion}`);

  // 构建Deno版本文件
  console.log('\n构建 Deno 版本文件...');
  try {
    execSync('bun run deno-build', { stdio: 'inherit' });
    console.log('✅ Deno 构建完成');
  } catch (error) {
    console.error('❌ Deno 构建失败:', error);
    process.exit(1);
  }

  // 提交更改并创建标签
  console.log('\n提交更改...');
  execSync('git add package.json', { stdio: 'inherit' });
  execSync(`git commit -m "chore: 发布 v${newVersion}"`, { stdio: 'inherit' });
  execSync(`git tag -a v${newVersion} -m "v${newVersion}"`, { stdio: 'inherit' });

  console.log(`
✅ 版本已更新为 v${newVersion}
✅ deno.js 已构建完成

执行以下命令推送更改并触发构建:
  git push && git push --tags
或者使用:
  bun run push
`);
};

// 执行主程序
main().catch(error => {
  console.error('发布过程发生错误:', error);
  process.exit(1);
});
