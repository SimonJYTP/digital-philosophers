# 康德语料导入说明

本目录中的七份清单对应用户提供的七个 Project Gutenberg EPUB。原始 EPUB 保存在 `knowledge/source-files/immanuel-kant/`，该目录不进入 Git；清单保存书目、版本、权利说明、R2 对象键和经过源文件复核的首批片段。

## 已接入著作

| Gutenberg 编号 | 著作 | 语言与版本 | 核心定位 |
| --- | --- | --- | --- |
| 4280 | `Critique of Pure Reason` | J. M. D. Meiklejohn 英译 | A51/B75 |
| 48433 | `Critique of Judgment` | J. H. Bernard 英译，1914 | §2 |
| 50922 | `Perpetual Peace` | Mary Campbell Smith 英译，1903 | 第二条正式条款 |
| 52821 | `Prolegomena` | Paul Carus 英文编订版，1912 | 先验问题的四个问题 |
| 5682 | `Groundwork of the Metaphysics of Morals` | Thomas Kingsmill Abbott 英译 | Ak 4:421 |
| 5683 | `Critique of Practical Reason` | Thomas Kingsmill Abbott 英译 | Ak 5:30 |
| 6343 | `Kritik der reinen Vernunft` | 1787 德文第二版 | A51/B75 |

《纯粹理性批判》的英译本和德文第二版共用同一个 `work`，但分别建立 `edition`，因此当前是六部不同著作、七个版本和七条 `active` 核心片段。

这些片段用于确认端到端检索已经打通，不代表整本书已完成精细切片。德文原文使用 `DIRECT_FIRST_PERSON`；历史英译本使用 `QUALIFIED_FIRST_PERSON`。

## 重新导入

先执行数据库迁移：

```powershell
npm run db:migrate:local
```

然后依次导入：

```powershell
Get-ChildItem knowledge/manifests/immanuel-kant/*.json |
  ForEach-Object {
    npm run knowledge:import:local -- $_.FullName
  }
```

导入是幂等的；相同著作、版本和片段 ID 会被更新，而不是重复创建。

## 后续扩充

继续切片时优先保留 Akademie 页码和《纯粹理性批判》的 A/B 页码。书信、讲义和后出的编订材料应使用 P2，并记录日期和语境。解释性摘要不得混入原文或译文。

Project Gutenberg 元数据只明确标注这些文件在美国属于公版。部署到其他司法辖区前仍需核验当地法律；生产站点不应提供 EPUB 公共下载接口。
