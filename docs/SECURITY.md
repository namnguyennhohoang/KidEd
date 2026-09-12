# SECURITY.md — Bảo mật, Quyền riêng tư, RBAC

Bổ trợ cho `CHILD_SAFETY.md` (threat model tập trung rủi ro cho trẻ). Tài liệu này tập trung cơ chế kỹ thuật.

## 1. Privacy-by-design

- **Data minimization** + **purpose limitation**: mỗi trường dữ liệu phải map tới một mục đích học tập đã nêu; không có "thu thập để dành".
- **Parent consent** trước khi xử lý; **child assent** khi phù hợp tuổi/quy định.
- **Retention** cấu hình (`DATA_RETENTION_DAYS`); job dọn dữ liệu quá hạn; soft-delete → hard-delete.
- **Export / correction / deletion**: API + job + audit; có test end-to-end.
- **Encryption in transit** (TLS) và **at rest** (DB + object storage + artifact offline trên thiết bị).
- **Không** quảng cáo, bán/chia sẻ dữ liệu, hồ sơ thương mại, nhắm mục tiêu, social graph.
- **Không** dùng dữ liệu trẻ để train model (mặc định); gọi provider kèm opt-out.
- Tách **telemetry kỹ thuật** khỏi **nội dung học của trẻ** (store & pipeline riêng).

## 2. RBAC — vai trò & phạm vi

| Vai trò | Được | Không được (mặc định) |
|---|---|---|
| `PLATFORM_ADMIN` | Vận hành hạ tầng, cấu hình hệ thống | Xem nội dung học riêng tư của gia đình |
| `FAMILY_OWNER` / `PARENT` | Quản lý trẻ, đồng ý, dữ liệu, chương trình, cấp quyền teacher/mentor | Xem dữ liệu gia đình khác |
| `CHILD` | Trải nghiệm học giới hạn theo tuổi | Parent Dashboard, cấu hình, dữ liệu chiến lược, dữ liệu trẻ khác |
| `TEACHER` | Giao nhiệm vụ + phản hồi theo rubric + xác nhận minh chứng **trong phạm vi phụ huynh cấp** | Nhật ký gia đình, dữ liệu nhạy cảm ngoài phạm vi |
| `MENTOR` | Chỉ xem dự án/lĩnh vực được chia sẻ | Mọi thứ khác |
| `CONTENT_AUTHOR` | Soạn nội dung | Duyệt/xuất bản; dữ liệu trẻ |
| `CONTENT_REVIEWER` | Duyệt/xuất bản nội dung | Dữ liệu trẻ |

**Enforcement:**
- Mọi truy cập dữ liệu trẻ kiểm tra **quan hệ** (`family_id`, `teacher_assignment`, `mentor_assignment`) + **scope** ở **backend**. Không chỉ ẩn nút ở frontend.
- Object-level authorization (chống IDOR/BOLA): resource id luôn được kiểm tra chủ sở hữu; ưu tiên truy vấn "resource WHERE id = ? AND family_id = ?".
- Child session (`auth_session.kind = CHILD`) do phụ huynh mở, có `parent_session_id`, TTL ngắn, không nâng quyền được.
- Parent Dashboard sau **PIN / xác thực lại** (`PARENT_DASHBOARD_PIN_REQUIRED`).
- Deny-by-default; least privilege; mọi cấp quyền có audit.

## 3. Xác thực & phiên

- Session hoặc token an toàn (HttpOnly, Secure, SameSite); rotation; revoke.
- Không JWT chứa dữ liệu nhạy cảm; không lưu token ở localStorage cho child app.
- Rate limit đăng nhập; khóa mềm; thông báo phụ huynh khi có phiên bất thường.

## 4. Upload media

- Whitelist MIME + kiểm tra magic bytes; giới hạn kích thước; đổi tên; loại metadata EXIF nhạy cảm.
- Chiến lược quét malware; lưu ở bucket riêng, domain phục vụ tách biệt, không thực thi.
- Không fetch URL do input cung cấp (chống SSRF).
- Authorization: chỉ chủ sở hữu/được cấp quyền đọc artifact.

## 5. AI provider exposure

- Redaction layer bắt buộc trước khi gửi: bỏ tên thật, trường, địa chỉ, liên hệ, ngày sinh đầy đủ.
- `child_id` pseudonymous; bảng ánh xạ chỉ ở server.
- Log payload gửi provider ở mức tối thiểu, redacted; test assert không có PII.
- Hợp đồng provider: no-train, no-retention hoặc retention tối thiểu, khu vực dữ liệu.

## 6. Observability

- Structured logs + audit logs + metrics; **không** chứa nội dung học của trẻ khi không cần.
- Log redaction cho secret & PII.
- Alerting: lỗi auth bất thường, tỷ lệ fallback AI cao, upload abuse, rule engine override bất thường.
- Incident response runbook (`infra/` — Giai đoạn 1+).

## 7. Secrets

- Secret chỉ ở server; `.env` trong `.gitignore`; cung cấp `.env.example`.
- Secret scan trong CI; không commit key; rotation policy.

## 8. Supply chain & chất lượng

- Dependency vulnerability scan; license inventory.
- Không để TODO quan trọng về security trong đường chạy production.
- Type check + lint + test chạy được bằng lệnh trong README.

## 9. Compliance checklist (xác minh với chuyên gia pháp lý trước production)

- [ ] Cơ sở pháp lý xử lý dữ liệu cá nhân trẻ em (VN + thị trường triển khai).
- [ ] Cơ chế consent/assent, rút lại consent, lưu bằng chứng consent.
- [ ] Thông báo quyền riêng tư dễ hiểu cho phụ huynh (và phiên bản cho trẻ).
- [ ] DPIA / đánh giá tác động (nếu quy định yêu cầu).
- [ ] Quy trình export/correction/deletion đáp ứng thời hạn luật định.
- [ ] Hợp đồng xử lý dữ liệu với nhà cung cấp AI / hạ tầng.
- [ ] Chính sách retention & xóa.
- [ ] Không tuyên bố "đã tuân thủ" chỉ vì có checkbox đồng ý.

## 10. Tiêu chí an toàn cho nghiệm thu MVP (mục 15 spec)

- Child session không truy cập được Parent Dashboard.
- Không lộ API key / secret ở client hoặc log.
- Test IDOR/BOLA cho tài nguyên trẻ.
- File upload kiểm tra type, size, malware strategy, authorization.
- Dữ liệu trẻ không dùng cho model training theo mặc định.
- Có export/delete test và audit trail.
