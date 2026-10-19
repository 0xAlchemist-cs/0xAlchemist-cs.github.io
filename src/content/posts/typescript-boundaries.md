---
title: '在边界处做校验，让 TypeScript 的类型真正可靠'
description: '示例文章：类型声明并不会自动验证外部数据，尝试在 API 与缓存入口增加运行时校验，让失败有清晰的回退路径。'
slug: 'typescript-boundaries'
publishedAt: '2026-10-16'
example: true
category: '工具与方法'
tags: ['TypeScript', '数据校验']
references:
  - title: 'TypeScript 类型收窄'
    url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html'
---

> **示例内容**：用于本地验证代码高亮、相关文章与主题页面，正式构建不会发布。

## 数据进入系统的地方

TypeScript 在编译时帮助检查代码，网络响应却是在运行时才到达。把 JSON 断言为某个接口，并不意味着里面的字段已经符合预期。

```ts
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
```

## 失败也需要明确的行为

对静态博客而言，项目接口暂时不可用，不应该导致文章都无法访问。可以先验证返回数据，成功后保存缓存；失败时保留已验证的内容，并说明数据获取时间。

## 写下可以检查的约定

类型、运行时校验和错误回退解决的是不同问题。让它们在系统边界各自发挥作用，维护时便更容易判断问题出在哪里。
