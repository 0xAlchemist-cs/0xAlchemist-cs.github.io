import { mkdir, writeFile } from 'node:fs/promises';

export interface AuditReport {
  errors: string[];
  warnings: string[];
  checked: number;
}
export async function writeReport(name: string, report: AuditReport) {
  await mkdir('reports', { recursive: true });
  await writeFile(
    `reports/${name}.json`,
    JSON.stringify(
      { ...report, generatedAt: new Date().toISOString() },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    `reports/${name}.md`,
    `# ${name}\n\n检查 ${report.checked} 项；错误 ${report.errors.length}；警告 ${report.warnings.length}。\n\n## 错误\n\n${report.errors.map((error) => `- ${error}`).join('\n') || '无。'}\n\n## 提醒\n\n${report.warnings.map((warning) => `- ${warning}`).join('\n') || '无。'}\n`,
  );
  console.log(
    `${name}: checked=${report.checked}, errors=${report.errors.length}, warnings=${report.warnings.length}`,
  );
  report.errors.forEach((error) => console.error(error));
  if (report.errors.length) process.exitCode = 1;
}
