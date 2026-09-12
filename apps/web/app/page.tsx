import Link from 'next/link';
import { Button, Card } from '@/components/ui';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Hành trình Tự làm được</h1>
        <p className="mt-1 text-slate-600">
          Giúp bé trở thành người học tự chủ. Đây không phải nơi làm bài hộ bé.
        </p>
      </div>
      <Card className="flex flex-col gap-3">
        <Link href="/onboarding">
          <Button className="w-full">Bắt đầu — tạo hồ sơ gia đình</Button>
        </Link>
        <Link href="/parent">
          <Button variant="ghost" className="w-full">
            Tôi đã có tài khoản
          </Button>
        </Link>
      </Card>
    </main>
  );
}
