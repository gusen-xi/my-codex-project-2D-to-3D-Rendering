---
name: weekly-work-report
description: Summarize a project's weekly work from Git commit history into a Chinese Markdown report. Use when asked to prepare a weekly report from local Git and optionally GitHub history; do not infer completed work from uncommitted files.
---

# Weekly Work Report

Generate a concise report grounded in committed changes for the requested project and week.

## Rules

- Use the Asia/Shanghai calendar week, Monday through Sunday. Include the date range and report generation date. For an unfinished week, state that the report is current through its generation date.
- Treat local Git commits as the baseline. Include GitHub commits only when access is available and the repository can be verified; otherwise report the limitation and proceed with local history.
- Include only commits in the requested week. Exclude merge commits from the count of distinct work unless the merge itself introduces changes not present in its parents. Avoid double-counting commits already present locally and remotely.
- Inspect commit subjects, dates, and changed files or diffs before summarizing. Group related changes into outcomes; do not simply paste commit messages.
- Do not count uncommitted, staged, or untracked files as completed work. Do not infer implementation, testing, impact, blockers, or plans without evidence in the included commit history. If a requested section has no supporting evidence, say so explicitly.
- Keep problems/risks factual. Distinguish a limitation in the available history source from a project blocker.

## Workflow

1. Confirm the project root and requested week; determine the Monday–Sunday range in Asia/Shanghai.
2. Inspect local history in that time range, including commit hashes, author/commit dates, subjects, and changed paths. Review diffs where needed to understand outcomes. Detect merges and duplicate remote/local commits.
3. If GitHub supplements are requested or part of the established preference, use configured authenticated tooling when available. If unavailable, rate-limited, or inaccessible, record that limitation and continue with local Git without claiming remote verification.
4. Build the report with sections for work outcomes, progress, problems/risks, and next-week plan. Leave the plan evidence-based; state that no plan was found when commits provide none.
5. Save one UTF-8 Markdown file in the project's designated weekly-report directory, using a filename that includes the week date range. Create the directory if needed without overwriting an existing report; if one exists, inspect and update only when the request clearly targets that same report.
6. Verify the reporting period, commit hashes, merge handling, statements against the diffs, Markdown headings, and output path.

## Report template

```markdown
# 工作周报（YYYY-MM-DD 至 YYYY-MM-DD）

> 统计口径：北京时间自然周；生成日期：YYYY-MM-DD；提交统计截至：YYYY-MM-DD。

## 工作成果
## 进展
## 问题与风险
## 下周计划

### 提交依据
```

List short hashes and commit subjects under the evidence section. Mention when remote history could not be checked. Keep the report limited to the requested project and period.
