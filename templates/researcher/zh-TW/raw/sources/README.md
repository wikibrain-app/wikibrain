---
source_type: note
---
# 論文來源怎麼放

一篇論文一檔，檔名用 citation key，例如 `chen2024keyword.md`。front-matter 範例：

```yaml
---
source_type: paper
citation_key: chen2024keyword
title: …
authors: [Chen, A., Lin, B.]
year: 2024
venue: Journal of the Medical Library Association
doi: 10.xxxx/xxxxx
fetched_at: 2026-01-01
tags: [關鍵詞研究]
---
```

內文先放摘要與你摘錄的段落（標頁碼），再放你的初步理解（前面加「→」）。agent 會據此編出概念頁與論點頁。
