import { Suspense } from "react";
import ChatForm from "@/components/ChatForm";

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ChatForm slug={slug} embedded />;
}

export default function EmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-10 text-muted text-center justify-center flex">Loading responses...</p>}>
      <Content params={params} />
    </Suspense>
  );
}