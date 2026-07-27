# 黑格尔语料导入说明

本目录中的七份清单对应用户提供的七个 Project Gutenberg EPUB。原始 EPUB 保存在 `knowledge/source-files/hegel/`，该目录不进入 Git；清单保存书目、版本、权利说明、R2 对象键和经过源文件复核的首批片段。

## 已接入著作

| Gutenberg 编号 | 著作 | 语言与版本 | 证据等级 |
| --- | --- | --- | --- |
| 39064 | `Hegel's Philosophy of Mind` | William Wallace 英译，1894 | P1，历史译本 |
| 51635 | `Lectures on the History of Philosophy`, vol. 1 | E. S. Haldane 英译，1892 | P2，编订讲演录 |
| 55108 | `The Logic of Hegel` | William Wallace 英译，1892 | P1，历史译本 |
| 55334 | `The Philosophy of Fine Art`, vol. 1 | F. P. B. Osmaston 英译，1920 | P2，编订讲演录 |
| 6698 | `Phänomenologie des Geistes` | 德文 | P1 |
| 6729 | `Wissenschaft der Logik`, Band 1 | 德文 | P1 |
| 6834 | `Wissenschaft der Logik`, Band 2 | 德文 | P1 |

每部著作目前有一个 `active` 核心片段，共七条。它们用于确认端到端检索已经打通，不代表整本书已完成精细切片。

## 重新导入

先执行数据库迁移：

```powershell
npm run db:migrate:local
```

然后依次导入：

```powershell
Get-ChildItem knowledge/manifests/hegel/*.json |
  ForEach-Object {
    npm run knowledge:import:local -- $_.FullName
  }
```

导入是幂等的；相同著作、版本和片段 ID 会被更新，而不是重复创建。

## 后续扩充

继续切片时，应优先使用稳定的章节号、节号或段落号。德文原著可以使用 `DIRECT_FIRST_PERSON`；历史译本使用 `QUALIFIED_FIRST_PERSON`；学生笔记和后出的讲演录使用 `P2`，并优先采用 `THIRD_PERSON_BACKGROUND`。

Project Gutenberg 元数据只明确标注这些文件在美国属于公版。部署到其他司法辖区前，仍需核验当地法律；生产站点不应提供 EPUB 公共下载接口。
