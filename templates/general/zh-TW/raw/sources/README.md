---
source_type: note
---
# 原始來源怎麼放

這個資料夾放**未經整理**的原始材料，一則一檔，建立後不再修改。front-matter 建議欄位：

```yaml
---
source_type: web | paper | meeting | chat | note
source_url: https://…
fetched_at: 2026-01-01
tags: [主題]
---
```

agent 讀到新來源後，會把重點編進 wiki/，並在 wiki 頁用 `[[raw/sources/檔名]]` 連回這裡。
