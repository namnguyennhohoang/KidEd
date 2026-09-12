# tests/ — contract & e2e dùng chung (Giai đoạn 1)

| Thư mục | Nội dung |
|---|---|
| `contract/` | `new-content-pack.spec` — chứng minh nạp ContentPack mới **không sửa code** (CONTENT_AUTHORING §5) |
| `e2e/` | Playwright — 12 bước MVP (PRODUCT.md §6); offline→online sync giữ artifact |
| `security/` | child session → 403 dashboard; IDOR/BOLA tài nguyên trẻ; upload abuse; no secret in log; export/delete + audit |

Unit/integration tests nằm cạnh mã nguồn trong từng `apps/*` và `packages/*`.
Lệnh chạy toàn bộ sẽ ghi ở README gốc khi Giai đoạn 1 bắt đầu.
