# 專案管理規則

適用帶專案、跨多個對話追蹤決策與待辦的人。與基礎規則並行，衝突時以本頁為準。

## 決策紀錄

- `wiki/decisions/` 一個決策一頁，檔名 `YYYY-MM-DD-主題.md`。結構固定：背景、選項、決定、理由、後果、狀態（提案／已定案／已推翻）。
- 決策被推翻時不刪頁，改狀態並連到新決策頁。

## 會議與對話

- 會議紀錄先進 `raw/sources/`（逐字或重點皆可，front-matter 記 `source_type: meeting`、`date`、`attendees`）。
- agent 從會議紀錄抽出三種東西寫進 wiki：決策（進 decisions/）、待辦（進 [[todo]]）、還沒定的事（進 [[open-questions]]）。

## 待辦

- `wiki/todo.md` 用 checkbox 清單，每條附負責人與到期日，完成的打勾並保留一週再移到 log.md。
- agent 在對話結尾要主動問：「這次有沒有新的待辦或決策要寫回知識庫？」
