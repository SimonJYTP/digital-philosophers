# 哲学家知识库使用说明

## 存储结构

知识库分成三层：

1. **R2 私有对象存储**保存 PDF、EPUB、TXT、Markdown、扫描件等原始文件。
2. **D1 数据库**保存作品、版本、来源定位、经过审核的文本切片及检索字段。
3. `lib/philosophers.ts` 中的内置知识卡作为数据库未配置、迁移未执行或没有命中时的安全回退。

聊天接口不会把整本书加载进模型，也不会向浏览器提供 R2 下载地址。每次回答最多选取四条相关证据。

## 原著文件放在哪里

### 本地准备目录

把原著文件放在：

```text
knowledge/
  source-files/
    immanuel-kant/
      <work-id>/
        <edition-id>/
          source.pdf
```

例如：

```text
knowledge/source-files/immanuel-kant/kant-groundwork/zhang-edition/source.pdf
```

`knowledge/source-files/` 已加入 `.gitignore`。这里是本地暂存区，不能把受版权保护的现代译本提交进 Git。

### 生产环境位置

导入后，文件进入私有 R2 的以下对象键：

```text
sources/<philosopher-id>/<work-id>/<edition-id>/<filename>
```

例如：

```text
sources/immanuel-kant/kant-groundwork/zhang-edition/source.pdf
```

R2 中的斜杠是对象键前缀，不是真实文件夹。D1 的 `editions.r2_key` 保存该键，便于追溯文件，但网页没有公开下载接口。

## D1 数据表

### `works`

每部作品一行，保存：

- 哲学家 ID
- 作品名与原文名
- 作品类型、原始语言和首版年份
- P1/P2/S1 等来源等级
- 版权状态和备注

哲学家名册仍只存在于 `lib/philosophers.ts`；数据库使用 `philosopher_id` 关联，不复制人物名册和人格提示词。

### `editions`

每个版本或译本一行，保存：

- 译者、编者、出版社、年份和 ISBN
- 语言与来源链接
- 权利状态和授权说明
- R2 对象键、文件名、MIME 类型、文件大小和 SHA-256

同一作品的德文原版、英文版和中文版应建立不同的 edition。

### `passages`

每个审核后的文本切片一行，保存：

- 章节、卷页号或 Akademie 编号
- 原文片段与译文片段
- 与原文分离的解释性摘要
- 中英文主题词
- doctrine、method、style、boundary 等用途
- P1/P2/S1 证据等级
- 第一人称使用等级
- 时间阶段、主张编号、优先级和审核状态

只有 `status: "active"` 的切片会进入聊天检索；新材料不确定时先使用 `draft`。

## 首次配置

生成数据库迁移：

```powershell
npm run db:generate
```

项目已经包含首个迁移。初始化或更新本地 D1 时执行：

```powershell
npm run db:migrate:local
```

该命令使用 `wrangler.local.jsonc`，只操作 `.wrangler/` 下的本地模拟数据；重复执行时只应用尚未执行的迁移。

需要测试 D1/R2 时使用带本地 Cloudflare 绑定的开发模式：

```powershell
npm run dev:sites
```

普通的 `npm run dev` 仍可使用，但它没有 D1/R2 绑定，会自动使用内置知识卡。

## 准备一本书

1. 将原始文件放入 `knowledge/source-files/<philosopher-id>/...`。
2. 复制 `knowledge/manifests/immanuel-kant.example.json`。
3. 将副本命名为 `.local.json`，例如：

   ```text
   knowledge/manifests/kant-groundwork.local.json
   ```

4. 填写真实书目信息、版权状态和 `sourceFile`。
5. 为每个审核后的段落填写 locator、原文、译文、解释性摘要和主题词。

只生成待审核 SQL 和导入回执：

```powershell
npm run knowledge:prepare -- knowledge/manifests/kant-groundwork.local.json
```

输出位于 `knowledge/generated/`，该目录不会提交进 Git。

完成本地 R2 与 D1 导入：

```powershell
npm run knowledge:import:local -- knowledge/manifests/kant-groundwork.local.json
```

导入使用幂等 upsert；相同 ID 可重复执行以更新内容。

## 生产环境导入

生产导入接口为：

```text
POST /api/admin/knowledge/import
```

必须设置服务器密钥 `KNOWLEDGE_IMPORT_TOKEN`，并用 Bearer Token 调用。接口只接受 multipart：

- `manifest`：与本地清单相同的 JSON 内容
- `file`：对应的原著文件

PowerShell 示例：

```powershell
$env:KNOWLEDGE_TOKEN = "生产环境中的导入密钥"
curl.exe -X POST "https://你的站点/api/admin/knowledge/import" `
  -H "Authorization: Bearer $env:KNOWLEDGE_TOKEN" `
  -F "manifest=<knowledge/manifests/kant-groundwork.local.json" `
  -F "file=@knowledge/source-files/immanuel-kant/kant-groundwork/zhang-edition/source.pdf;type=application/pdf"
```

该接口：

- 限制单文件最大 50 MB；
- 每次最多写入 48 条切片，以兼容 D1 Free 的单次调用查询数限制；
- 校验哲学家 ID 必须来自现有名册；
- 使用固定字段和 prepared statements，不能执行上传者提供的 SQL；
- 先将文件写入私有 R2，再用 D1 batch 原子写入元数据和切片；
- 不提供浏览、下载或删除原著的公共接口。

如果需要上传大于 50 MB 的扫描件，应增加专门的分片上传工具，不要提高公开请求上限。

## 文本提取和切片建议

- 数字文本优先保留 TXT 或 Markdown 版本，同时把 PDF/EPUB 原件存入 R2。
- 扫描 PDF 先做 OCR，再人工检查卷页号、德文字符、脚注和断行。
- 切片应围绕完整论证单元，不按固定页数机械切割。
- 中文建议约 300–800 字，英文建议约 150–400 词；必要时保留 10%–15% 上下文重叠。
- locator 必须使用可复核位置，例如 `Ak 4:421`、`A50/B74`、书信编号和印刷页码。
- `originalText` 与 `translationText` 只能保存核对过的文本。
- `interpretiveNote` 必须是自己的解释，不得伪装成原文引语。
- P2 书信和讲义必须记录时间与场景，不能自动当作成熟公开教义。
- S1 学术研究只能作为背景，不得让 Agent 冒充个人记忆。

## 版权规则

- 康德德文原著通常属于公版，但具体数字文件仍可能带有数据库权利或使用条款。
- 现代中文、英文译本通常仍受版权保护。
- “购买了一本书”不等于取得复制、上传或再分发权。
- 权利不明确时，将 `rightsStatus` 写为 `verify-before-upload`，切片保持 `draft`。
- 不在网页中提供原文件下载；需要引用时只使用许可范围内的短片段。
