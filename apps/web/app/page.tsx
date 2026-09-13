import Link from 'next/link';
import { Button, Card } from '@/components/ui';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-6 sm:p-10">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">Hành trình Tự làm được</h1>
          <p className="mt-3 text-lg text-slate-600">
            Giúp bé trở thành người học tự chủ. Đây không phải nơi làm bài hộ bé.
          </p>
        </div>
        <Card className="flex flex-col gap-4">
          <Link href="/onboarding">
            <Button className="w-full text-lg">Bắt đầu — tạo hồ sơ gia đình</Button>
          </Link>
          <Link href="/parent">
            <Button variant="ghost" className="w-full text-lg">
              Tôi đã có tài khoản
            </Button>
          </Link>
        </Card>
      </main>
    </div>
  );
}
