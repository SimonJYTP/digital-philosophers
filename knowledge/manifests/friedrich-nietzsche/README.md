# 尼采语料导入说明

本目录的十份清单对应用户提供的九个 Project Gutenberg EPUB。原始 EPUB 保存在
`knowledge/source-files/friedrich-nietzsche/`，该目录不会进入 Git；清单保存作品、
版本、权利说明、R2 对象键和经过源文件复核的首批片段。

## 已接入著作

| Gutenberg 编号 | 著作 | 语言与版本 | 证据等级 |
| --- | --- | --- | --- |
| 1998 | `Thus Spake Zarathustra` | Thomas Common 英译 | P1，历史译本 |
| 38145 | `Human, All Too Human` | Alexander Harvey 英译，1908 | P1，历史译本 |
| 4363 | `Beyond Good and Evil` | Helen Zimmern 英译 | P1，历史译本 |
| 7204 | `Jenseits von Gut und Böse` | 德文 | P1 |
| 51356 | `The Birth of Tragedy` | William A. Haussmann 英译，1910 | P1，历史译本 |
| 52190 | `Ecce Homo` | Anthony M. Ludovici 英译，1911 | P1，死后出版文本 |
| 52263 | `The Twilight of the Idols` | Anthony M. Ludovici 英译，1911 | P1，历史译本 |
| 52263 | `The Antichrist` | Anthony M. Ludovici 英译，1911 | P1，死后出版文本 |
| 52319 | `On the Genealogy of Morality` | Horace B. Samuel 英译，1913 | P1，历史译本 |
| 52881 | `The Gay Science` | Thomas Common 英译，1910 | P1，历史译本 |

编号 52263 是包含两部著作的合订 EPUB，因此知识库把它拆成两条作品和两个独立
R2 对象键。《善恶的彼岸》的英译和德文则作为同一作品的两个版本保存。因此最终
形成九部作品、十个版本。

每个版本目前有一个 `active` 核心片段，共十条，用来确认端到端检索已经打通；
这不代表整本书已经完成精细切片。后续应按章、节或箴言号继续切片，并逐条保留
版本、定位、译者和解释边界。

## 重新导入

```powershell
npm run db:migrate:local

Get-ChildItem knowledge/manifests/friedrich-nietzsche/*.json |
  ForEach-Object {
    npm run knowledge:import:local -- $_.FullName
  }
```

导入是幂等的：相同作品、版本和片段 ID 会被更新，不会重复创建。导入命令会把
源文件复制到本地 R2 模拟目录，并把书目、版本和片段写入本地 D1。

## 使用边界

- 德文原文可使用 `DIRECT_FIRST_PERSON`；历史译本使用
  `QUALIFIED_FIRST_PERSON`。
- 《反基督者》的强烈论战性段落默认只作 `THIRD_PERSON_BACKGROUND`，避免把历史
  文本的攻击性措辞变成 Agent 对用户的行为指令。
- 《瞧！这个人》和《反基督者》均需明确记录写作、死后出版及编辑史。
- 未接入来源不明的“权力意志”或“永恒轮回”遗稿汇编，以免把后人整理文本当成尼采
  生前定稿。
- Project Gutenberg 元数据只明确这些文件在美国属于公版。部署到其他司法辖区
  前仍需核验当地法律，生产站点也不应直接提供 EPUB 的公共下载入口。
