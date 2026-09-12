import { expect, type Page } from '@playwright/test';

export const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f2f0000000049454e44ae426082',
  'hex',
);

/** Đăng ký + tạo hồ sơ bé, dừng ở /parent (chưa mở phiên trẻ). */
export async function onboardParent(page: Page, opts: { imageConsent?: boolean } = {}): Promise<void> {
  const email = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.test`;
  await page.goto('/onboarding');
  await page.getByLabel('Tên của bạn').fill('Mẹ E2E');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu (≥ 8 ký tự)').fill('correct horse battery');
  await page.getByLabel('Mã PIN mở Bảng phụ huynh (4–8 số)').fill('246813');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('heading', { name: 'Tạo hồ sơ cho bé' })).toBeVisible();
  await page.getByLabel('Tên gọi ở nhà của bé').fill('Bé Bi');
  if (opts.imageConsent) await page.getByLabel('Cho phép tải ảnh bài làm của bé').check();
  await page.getByRole('button', { name: 'Xong' }).click();
  await expect(page).toHaveURL(/\/parent$/);
}

/** onboardParent + mở phiên trẻ, dừng ở /learn. */
export async function onboardAndStart(page: Page, opts: { imageConsent?: boolean } = {}): Promise<void> {
  await onboardParent(page, opts);
  await page.getByRole('button', { name: 'Bắt đầu cho bé' }).click();
  await expect(page).toHaveURL(/\/learn$/);
}

export async function runLoop(page: Page, opts: { photo?: boolean } = {}): Promise<void> {
  const choices = page.locator('[data-testid^="choice-"]');
  await expect(choices).toHaveCount(2);
  await choices.first().click();

  await page.getByTestId('plan-input').fill('Con vẽ hai ngôi nhà rồi chia chim');
  await page.getByTestId('plan-next').click();

  await page.getByTestId('hint-btn').click();
  await expect(page.getByTestId('coach-message')).toBeVisible();

  await page.getByTestId('attempt-input').fill('6 với 4');
  await page.getByTestId('attempt-submit').click();
  await expect(page.getByText('Số lần con đã thử: 1')).toBeVisible();
  await page.getByTestId('to-make').click();

  if (opts.photo) {
    await page.getByTestId('photo-input').setInputFiles({ name: 'tranh.png', mimeType: 'image/png', buffer: PNG_1x1 });
    await expect(page.getByText(/Đã lưu ảnh của con/)).toBeVisible();
    await page.getByRole('button', { name: 'Đi tiếp' }).click();
  } else {
    await page.getByTestId('skip-make').click();
  }
  await page.getByTestId('reflect-easy').click();
  await expect(page.getByTestId('done-message')).toBeVisible();
}

export async function openDashboard(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Xem tiến trình' }).click();
  await page.getByLabel('Mã PIN').fill('246813');
  await page.getByRole('button', { name: 'Mở' }).click();
}
