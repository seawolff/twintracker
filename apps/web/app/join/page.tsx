import { redirect } from 'next/navigation';

interface Props {
  searchParams: { code?: string };
}

export default function JoinPage({ searchParams }: Props) {
  const code = searchParams.code ?? '';
  redirect(`/login?mode=join${code ? `&code=${encodeURIComponent(code)}` : ''}`);
}
