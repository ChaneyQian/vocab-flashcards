# Vocab Flashcards · 词测闪卡

纯静态网页（HTML / CSS / JS，无依赖），用于课堂数学词汇测试。

## 两种模式

1. **随机卡** — 从所选主题里随机出词，点击卡片或按空格翻转，`→` 下一张。
2. **抽人回答** — 按成绩表排名加权抽一名学生并同时出一张词卡；`P` 抽人，`1` 答对，`2` 答错，记录可复制。
   - 分数 ≥ 30（可在「名单设置」里改）的学生不参与。
   - 权重 = 分数不低于自己的参与人数，因此分数越低被抽到的概率越高；同分权重相同。
   - 可选「一轮内不重复」，全部抽完自动开始新一轮。

「名单设置」里可以改分数、手动排除或增删学生，修改保存在浏览器 localStorage 中。

## 更新词表 / 成绩

把新的 `Vocabulary Test - <主题> - Answer.docx` 和成绩 `.xlsx`（含 `test` 工作表，第 10 列为分数）放到仓库根目录，然后：

```bash
pip install python-docx openpyxl
python scripts/build_data.py
```

会重新生成 `data.js`。docx / xlsx 本身在 `.gitignore` 中，不会被提交。

## 部署

推送到 `main` 后，`.github/workflows/pages.yml` 会自动发布到 GitHub Pages。
