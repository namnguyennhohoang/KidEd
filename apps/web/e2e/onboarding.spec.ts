import { test, expect } from '@playwright/test';
import { onboardParent, onboardAndStart, runLoop, openDashboard } from './helpers';

test('bước "thử làm" — MCQ mặc định; "Cách khác" vẫn mở được ô gõ chữ như cũ', async ({ page }) => {
  await onboardAndStart(page);
  await page.locator('[data-testid^="choice-"]').first().click();
  await page.getByTestId('plan-next').click();

  // Mặc định hiện các đáp án trắc nghiệm, không có ô gõ chữ.
  const options = page.locator('[data-testid^="attempt-option-"]');
  await expect(options).toHaveCount(4);
  await expect(page.getByTestId('attempt-input')).toHaveCount(0);

  // "Cách khác" mở lại đường gõ chữ cũ, vẫn hoạt động như trước khi có MCQ.
  await page.getByTestId('attempt-other').click();
  await expect(page.getByTestId('attempt-input')).toBeVisible();
  await expect(options).toHaveCount(0);
  await page.getByTestId('attempt-input').fill('Con tự nghĩ ra cách chia 9 và 1');
  await page.getByTestId('attempt-submit').click();
  await expect(page.getByText('Số lần con đã thử: 1')).toBeVisible();
});

test('bước "thử làm" — trò chơi kéo-thả ghép từ với hình (match_pairs)', async ({ page }) => {
  const mockUnit = {
    id: 'mock-match-unit-001',
    title: '🎯 Ghép từ với hình (test)',
    stage: 'BASE_CAMP',
    choices: [
      { id: 'A', label: 'Cách A' },
      { id: 'B', label: 'Cách B' },
    ],
    hints: [{ level: 1, type: 'REPHRASE', content: 'Gợi ý' }],
    questFlow: {
      hook: 'Ghép từ với hình nhé',
      plan_prompt: 'Con định làm gì trước?',
      attempt_requirement: { minimum_attempts_before_solution: 1 },
      explain_prompt: 'Con giải thích cách ghép?',
      reflection_prompt: 'Con thấy sao?',
      match_pairs: [
        { id: 'cat', label: 'cat', visual: 'cat' },
        { id: 'dog', label: 'dog', visual: 'dog' },
        { id: 'chicken', label: 'chicken', visual: 'chicken' },
      ],
    },
  };
  // sw.js dùng stale-while-revalidate cho /api/content/* bằng fetch() riêng trong service worker —
  // fetch đó KHÔNG đi qua page.route() của Playwright. Tắt đăng ký service worker cho riêng test này
  // để mock áp dụng được (ADR 0005 mô tả sw.js; xem components/sw-register.tsx).
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: { register: () => Promise.reject(new Error('disabled for e2e')) },
      configurable: true,
    });
  });

  await page.route(/\/api\/content\/packs(\?|\/|$)/, async (route) => {
    const url = route.request().url();
    if (url.includes('/content/packs/mock-pack')) {
      await route.fulfill({ json: { pack: { id: 'mock-pack', stage: 'BASE_CAMP' }, units: [mockUnit] } });
    } else {
      await route.fulfill({ json: { packs: [{ id: 'mock-pack', stage: 'BASE_CAMP' }] } });
    }
  });

  await onboardAndStart(page);
  await expect(page.locator('h1')).toContainText('Ghép từ với hình');
  await page.locator('[data-testid^="choice-"]').first().click();
  await page.getByTestId('plan-next').click();

  // 3 hình mục tiêu + 3 thẻ chữ kéo-thả, chưa ghép hình nào.
  const chips = page.locator('[data-testid^="match-chip-"]');
  await expect(chips).toHaveCount(3);
  await expect(page.getByText('cat', { exact: true }).first()).toBeVisible();

  // Kéo từng thẻ chữ thả đúng vào ô hình tương ứng (data-match-target).
  for (const id of ['cat', 'dog', 'chicken']) {
    await page.getByTestId(`match-chip-${id}`).dragTo(page.locator(`[data-match-target="${id}"]`));
  }
  await expect(page.locator('[data-match-target="cat"]')).toContainText('✅ cat');
  await expect(chips).toHaveCount(0);

  // Ghép xong toàn bộ tự tính là một lần thử -> đủ điều kiện đi tiếp.
  await expect(page.getByText('Số lần con đã thử: 1')).toBeVisible();
  await page.getByTestId('to-make').click();
});

test('onboarding → chu trình học đầy đủ → dashboard', async ({ page }) => {
  await onboardAndStart(page);
  await runLoop(page);

  await page.getByTestId('rest-btn').click();
  await expect(page).toHaveURL(/\/parent$/);

  await openDashboard(page);
  await expect(page.getByTestId('completed-sessions')).toHaveText('1');
  await expect(page.getByTestId('suggested-action')).toBeVisible();

  await page.getByTestId('obs-input').fill('Bé tự chia được 10 thành 6 và 4');
  await page.getByTestId('obs-submit').click();
  await expect(page.getByText('Bé tự chia được 10 thành 6 và 4')).toBeVisible();

  await page.getByTestId('export-btn').click();
  await expect(page.getByTestId('export-link')).toBeVisible();

  // Mức sẵn sàng theo kỹ năng (PIN đã xác thực ở bước trên).
  await page.getByTestId('readiness-link').click();
  await expect(page).toHaveURL(/\/readiness$/);
  await expect(page.getByTestId('readiness-disclaimer')).toContainText(/không phải xếp hạng/i);
  await expect(page.locator('[data-testid^="band-"]').first()).toBeVisible();
});

test('Quy chế tuyển sinh: tạo bản nháp → xác minh (PIN) → VERIFIED', async ({ page }) => {
  await onboardParent(page);
  await page.getByTestId('admissions-link').click();
  await expect(page).toHaveURL(/\/parent\/admissions$/);

  await page.getByLabel('Tên cơ sở').fill('THCS-THPT Trần Đại Nghĩa');
  await page.getByLabel('Mã cơ sở (viết tắt)').fill('TDN');
  await page.getByLabel('Năm tuyển sinh').fill('2028');
  await page.getByLabel('URL nguồn chính thức').fill('https://thcsthpttrandainghia.edu.vn/tuyen-sinh-lop-6');
  await page.getByLabel('Ngày kiểm tra nguồn').fill('2026-09-08');
  await page.getByLabel('Rà soát lại trước ngày').fill('2027-06-01');
  await page.getByTestId('adm-create').click();
  await expect(page.getByText('Đã tạo bản nháp quy chế.')).toBeVisible();

  const row = page.locator('[data-testid^="rule-"]').first();
  await expect(row.locator('[data-testid^="rule-status-"]')).toHaveText('DRAFT');
  await page.getByTestId('adm-pin').fill('246813');
  await row.getByTestId(/^verify-/).click();
  await expect(row.locator('[data-testid^="rule-status-"]')).toHaveText('VERIFIED');
});

test('offline → chu trình học + chụp ảnh khi mất mạng → đồng bộ (session + artifact mã hóa) khi có lại mạng', async ({
  page,
  context,
}) => {
  await onboardAndStart(page, { imageConsent: true });
  await expect(page.locator('[data-testid^="choice-"]').first()).toBeVisible();

  await context.setOffline(true);
  await runLoop(page, { photo: true });
  await expect(page.getByTestId('offline-banner')).toBeVisible();

  const synced = page.waitForResponse(
    (r) => r.url().includes('/api/sessions/sync') && r.request().method() === 'POST' && r.ok(),
  );
  const artifactUp = page.waitForResponse(
    (r) => /\/api\/sessions\/.+\/artifacts$/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
  );
  await context.setOffline(false);
  await synced;
  await artifactUp;

  await page.getByTestId('rest-btn').click();
  await expect(page).toHaveURL(/\/parent$/);
  await openDashboard(page);
  await expect(page.getByTestId('completed-sessions')).toHaveText('1');
});

test('GĐ4: hoàn thành phiên → trang Hứng thú có tín hiệu tự động; tạo chu kỳ trải nghiệm', async ({ page }) => {
  await onboardAndStart(page);
  await runLoop(page);
  await page.getByTestId('rest-btn').click();
  await expect(page).toHaveURL(/\/parent$/);
  await openDashboard(page);

  await page.getByTestId('specialisation-link').click();
  await expect(page).toHaveURL(/\/specialisation$/);
  await expect(page.getByTestId('spec-disclaimer')).toBeVisible();
  // Phiên vừa hoàn thành trên unit Toán -> có tín hiệu hứng thú tự động.
  await expect(page.getByTestId('trend-MATHEMATICS')).toBeVisible();

  await page.getByTestId('cycle-title').fill('Vòng khám phá học kỳ 1');
  for (const d of ['MATHEMATICS', 'SCIENCE', 'ART_DESIGN']) await page.getByTestId(`domain-${d}`).click();
  await page.getByTestId('cycle-create').click();
  await expect(page.locator('[data-testid^="cycle-status-"]').first()).toHaveText('đang chạy');

  // Khép lại chu kỳ rồi chốt môn chuyên (GĐ4b).
  await page.getByTestId('cycle-reflect').fill('Bé bền hứng thú với toán và khoa học suốt chu kỳ.');
  await page.getByTestId('cycle-complete').click();
  await expect(page.locator('[data-testid^="cycle-status-"]').first()).toHaveText('đã khép lại');

  await page.getByTestId('choice-primary').selectOption('MATHEMATICS');
  await page.getByTestId('choice-backup').selectOption('SCIENCE');
  await page.getByTestId('choice-rationale').fill('Toán là mạch xuyên suốt; khoa học là hướng gần.');
  await page.getByTestId('choice-save').click();
  await expect(page.getByTestId('choice-current')).toContainText('Toán');
  await expect(page.locator('[data-testid^="depth-"]').first()).toBeVisible();
});

test('GĐ6: phụ huynh tạo liên kết chỉ-đọc → người xem mở /shared bằng token', async ({ page }) => {
  await onboardAndStart(page);
  await runLoop(page);
  await page.getByTestId('rest-btn').click();
  await openDashboard(page);

  await page.getByTestId('share-link').click();
  await expect(page).toHaveURL(/\/share$/);
  await page.getByTestId('scope-dashboard').check(); // readiness đã bật sẵn
  await page.getByTestId('create-link').click();

  const linkLine = await page.getByTestId('fresh-link').locator('p').last().innerText();
  expect(linkLine).toContain('/shared#');

  await page.goto(linkLine.trim());
  await expect(page.getByTestId('shared-heading')).toBeVisible();
  await expect(page.getByTestId('tab-readiness')).toBeVisible();
  await page.getByTestId('tab-dashboard').click();
  await expect(page.getByText(/Phiên đã hoàn thành/)).toBeVisible();
});

test('GĐ6: phụ huynh mời giáo viên bằng email → giáo viên đăng ký, nhận mã, xem', async ({ page }) => {
  const eduEmail = `edu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.test`;

  await onboardAndStart(page);
  await runLoop(page);
  await page.getByTestId('rest-btn').click();
  await openDashboard(page);
  await page.getByTestId('share-link').click();

  await page.getByTestId('invite-email').fill(eduEmail);
  await page.getByTestId('invite-educator').click();
  const codeLine = await page.getByTestId('fresh-code').locator('p').last().innerText();
  const code = codeLine.trim();
  expect(code.length).toBeGreaterThan(6);

  // Sang phía giáo viên (bỏ phiên phụ huynh).
  await page.context().clearCookies();
  await page.goto('/educator');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await page.getByTestId('edu-name').fill('Cô Lan');
  await page.getByTestId('edu-email').fill(eduEmail);
  await page.getByTestId('edu-password').fill('correct horse battery');
  await page.getByTestId('edu-submit').click();

  await page.getByTestId('invite-code').fill(code);
  await page.getByTestId('redeem').click();
  await expect(page.getByTestId('code-msg')).toHaveText('Đã nhận lời mời.');

  const child = page.locator('[data-testid^="edu-child-"]').first();
  await expect(child).toBeVisible();
  await child.locator('[data-testid$="-readiness"]').click();
  await expect(child.getByText(/không phải xếp hạng/i)).toBeVisible();
});

test('GĐ5: tạo dự án học giả + ghi mốc có khai báo AI bắt buộc', async ({ page }) => {
  await onboardParent(page);
  await openDashboard(page);

  await page.getByTestId('scholar-link').click();
  await expect(page).toHaveURL(/\/scholar$/);
  await expect(page.getByTestId('scholar-disclaimer')).toBeVisible();

  await page.getByTestId('project-title').fill('Nước sạch cho xóm');
  await page.getByTestId('project-question').fill('Lọc nước mưa an toàn chi phí thấp thế nào?');
  await page.getByTestId('disc-SCIENCE').click();
  await page.getByTestId('project-create').click();
  await expect(page.locator('[data-testid^="project-status-"]').first()).toHaveText('đang làm');

  // Mốc có AI viết nháp -> ô khai báo bắt buộc xuất hiện.
  await page.getByTestId('contrib-ai').selectOption('AI_GENERATED_DRAFT');
  await expect(page.getByTestId('contrib-note')).toBeVisible();
  await page.getByTestId('contrib-summary').fill('Viết bản nháp báo cáo giữa kỳ.');
  await page.getByTestId('contrib-note').fill('AI viết bản nháp đầu theo dàn ý của con; con viết lại bằng lời mình.');
  await page.getByTestId('contrib-add').click();
  await expect(page.getByText('Viết bản nháp báo cáo giữa kỳ.')).toBeVisible();
  // Kê khai AI cập nhật: mức "AI viết bản nháp" đếm được 1.
  await expect(page.getByText('AI viết bản nháp: 1')).toBeVisible();
});

test('luyện có tính giờ: bật đồng hồ → /learn hiện đếm ngược → sync gửi timed', async ({ page }) => {
  await onboardParent(page);
  await page.getByTestId('timed-toggle').getByRole('checkbox').check();

  let syncedTimed: unknown = undefined;
  page.on('request', (req) => {
    if (req.url().includes('/api/sessions/sync') && req.method() === 'POST') {
      try {
        syncedTimed = (JSON.parse(req.postData() ?? '{}') as { session?: { timed?: unknown } }).session?.timed;
      } catch {
        /* bỏ qua */
      }
    }
  });

  await page.getByRole('button', { name: 'Bắt đầu cho bé' }).click();
  await expect(page).toHaveURL(/\/learn$/);

  await page.locator('[data-testid^="choice-"]').first().click();
  await expect(page.getByTestId('countdown')).toBeVisible();

  await page.getByTestId('plan-input').fill('Con vẽ hai ngôi nhà rồi chia chim');
  await page.getByTestId('plan-next').click();
  await page.locator('[data-testid^="attempt-option-"]').first().click();
  await page.getByTestId('to-make').click();
  await page.getByTestId('skip-make').click();
  await page.getByTestId('reflect-easy').click();
  await expect(page.getByTestId('done-message')).toBeVisible();

  await expect.poll(() => syncedTimed).toBe(true);
});

test('Content Studio: soạn → gửi duyệt → PIN → xuất bản; sửa non-DRAFT bị chặn', async ({ page }) => {
  await onboardParent(page);
  await page.getByTestId('studio-link').click();
  await expect(page).toHaveURL(/\/studio$/);

  const pack = {
    kind: 'CONTENT_PACK',
    schema_version: '1.0.0',
    content_version: '1.0.0',
    title: 'Gói E2E của gia đình',
    locale: 'vi-VN',
    stage: 'BASE_CAMP',
    grades: [1],
    provenance: { author: 'Ba E2E', license: 'ORIGINAL_OR_LICENSED' },
    units: [
      {
        id: 'e2e-unit-001',
        schema_version: '1.0.0',
        content_version: '1.0.0',
        status: 'DRAFT',
        title: 'Đếm bước chân',
        locale: 'vi-VN',
        stage: 'BASE_CAMP',
        grades: [1],
        domains: ['MATHEMATICS', 'PHYSICAL_WELLBEING'],
        learning_outcomes: [{ framework: 'VN_GDPT', description: 'Đếm đến 20' }],
        skills: [
          { skill_id: 'MATH_NUMBER_SENSE', role: 'PRIMARY' },
          { skill_id: 'MOVEMENT_HABIT', role: 'SECONDARY' },
        ],
        duration_minutes: { screen: 3, offline: 15 },
        materials: ['một lối đi'],
        choices: [
          { id: 'SLOW', label: 'Con đi chậm và đếm' },
          { id: 'JUMP', label: 'Con nhảy và đếm' },
        ],
        quest_flow: {
          hook: 'Từ cửa ra sân là bao nhiêu bước nhỉ?',
          predict_prompt: 'Con đoán bao nhiêu bước?',
          plan_prompt: 'Con định đếm thế nào?',
          attempt_requirement: { minimum_attempts_before_solution: 1 },
          explain_prompt: 'Làm sao con nhớ được số?',
          revision_prompt: 'Con thử đi kiểu khác rồi đếm lại nhé?',
          reflection_prompt: 'Lần này con đếm có dễ hơn không?',
        },
        hints: [
          { level: 1, type: 'REPHRASE', content: 'Mình đang đếm số bước chân.' },
          { level: 2, type: 'QUESTION', content: 'Con đã đếm tới đâu rồi?' },
        ],
        evidence: ['VOICE_EXPLANATION', 'PARENT_OBSERVATION', 'CHILD_REFLECTION'],
        adaptations: {},
        safety: { adult_required: false, risk_level: 'LOW' },
        provenance: { author: 'Ba E2E', license: 'ORIGINAL_OR_LICENSED' },
      },
    ],
  };

  await page.getByTestId('pack-json').fill(JSON.stringify(pack, null, 2));
  await page.getByTestId('create-pack').click();
  await expect(page.getByText(/Đã tạo bản nháp/)).toBeVisible();

  const row = page.locator('[data-testid^="pack-"]').first();
  await expect(row.locator('[data-testid^="status-"]')).toHaveText('DRAFT');
  await row.getByTestId(/^submit-/).click();
  await expect(row.locator('[data-testid^="status-"]')).toHaveText('IN_REVIEW');

  await page.getByTestId('studio-pin').fill('246813');
  await row.getByTestId(/^approve-/).click();
  await expect(row.locator('[data-testid^="status-"]')).toHaveText('PUBLISHED');
});
