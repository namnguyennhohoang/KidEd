'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button, Card, Field } from '@/components/ui';

type Step = 'account' | 'child';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('account');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitAccount(form: FormData) {
    setError(null);
    setBusy(true);
    try {
      await api.post('auth/register', {
        email: String(form.get('email')),
        password: String(form.get('password')),
        familyName: String(form.get('familyName')),
        displayName: String(form.get('displayName')),
        pin: String(form.get('pin')),
      });
      setStep('child');
    } catch (e) {
      setError(messageFor(e, 'Không tạo được tài khoản. Kiểm tra email và mật khẩu (≥ 8 ký tự), PIN 4–8 số.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitChild(form: FormData) {
    setError(null);
    setBusy(true);
    try {
      const interestLabel = String(form.get('interest') ?? '').trim();
      await api.post('children', {
        displayName: String(form.get('childName')),
        birthMonth: Number(form.get('birthMonth')),
        birthYear: Number(form.get('birthYear')),
        screenSessionMinutes: Number(form.get('screenSessionMinutes')),
        interests: interestLabel ? [{ source: 'PARENT', label: interestLabel }] : [],
        consents: {
          voiceRecording: form.get('consentVoice') === 'on',
          imageUpload: form.get('consentImage') === 'on',
        },
      });
      router.push('/parent');
    } catch (e) {
      setError(messageFor(e, 'Không tạo được hồ sơ bé.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-bold">
        {step === 'account' ? 'Tạo tài khoản phụ huynh' : 'Tạo hồ sơ cho bé'}
      </h1>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {step === 'account' ? (
        <Card>
          <form action={submitAccount} className="flex flex-col gap-3">
            <Field id="familyName" name="familyName" label="Tên gia đình" required defaultValue="Gia đình" />
            <Field id="displayName" name="displayName" label="Tên của bạn" required />
            <Field id="email" name="email" type="email" label="Email" required autoComplete="email" />
            <Field
              id="password"
              name="password"
              type="password"
              label="Mật khẩu (≥ 8 ký tự)"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Field
              id="pin"
              name="pin"
              inputMode="numeric"
              pattern="\d{4,8}"
              label="Mã PIN mở Bảng phụ huynh (4–8 số)"
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Đang tạo…' : 'Tiếp tục'}
            </Button>
          </form>
        </Card>
      ) : (
        <Card>
          <form action={submitChild} className="flex flex-col gap-3">
            <Field id="childName" name="childName" label="Tên gọi ở nhà của bé" required />
            <div className="grid grid-cols-2 gap-3">
              <Field
                id="birthMonth"
                name="birthMonth"
                type="number"
                min={1}
                max={12}
                label="Tháng sinh"
                required
                defaultValue={9}
              />
              <Field
                id="birthYear"
                name="birthYear"
                type="number"
                min={2000}
                max={2100}
                label="Năm sinh"
                required
                defaultValue={2020}
              />
            </div>
            <Field
              id="screenSessionMinutes"
              name="screenSessionMinutes"
              type="number"
              min={3}
              max={60}
              label="Thời lượng mỗi phiên trên màn hình (phút)"
              required
              defaultValue={10}
            />
            <Field id="interest" name="interest" label="Bé thích gì? (không bắt buộc)" placeholder="ví dụ: vẽ" />
            <fieldset className="rounded-lg border border-slate-200 p-3 text-sm">
              <legend className="px-1 text-slate-600">Đồng ý</legend>
              <p className="mb-2 text-slate-500">
                Xử lý dữ liệu học tập cơ bản là bắt buộc để dùng ứng dụng. Các mục dưới đây tùy chọn, có thể tắt sau.
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="consentVoice" /> Cho phép ghi âm giọng bé
              </label>
              <label className="mt-1 flex items-center gap-2">
                <input type="checkbox" name="consentImage" /> Cho phép tải ảnh bài làm của bé
              </label>
            </fieldset>
            <Button type="submit" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Xong'}
            </Button>
          </form>
        </Card>
      )}
    </main>
  );
}

function messageFor(e: unknown, fallback: string): string {
  const status = (e as { status?: number }).status;
  if (status === 409) return 'Email này đã được đăng ký.';
  if (e instanceof Error && e.message && e.message !== 'HTTP 500') return e.message;
  return fallback;
}
