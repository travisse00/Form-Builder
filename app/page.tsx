import {
  ListChecks,
  MessageSquare,
  Code2,
  LayoutDashboard,
  CheckCircle2,
} from "lucide-react";
// import ThemeToggle from "@/components/ThemeToggle";
import Footer from "@/components/Footer";
import Script from "next/script";
import Navbar from "@/components/Navbar";

const features = [
  { icon: ListChecks, title: "Form builder", desc: "Text, email, multiple choice and yes/no questions. Reorder, require and preview." },
  { icon: MessageSquare, title: "Chat-style forms", desc: "One question at a time, so people actually finish." },
  { icon: Code2, title: "Embed anywhere", desc: "One script tag puts a floating widget on any website." },
  { icon: LayoutDashboard, title: "Simple dashboard", desc: "Publish, unpublish and read every submission with timestamps." },
];

const steps = [
  { n: "1", title: "Create", desc: "Build your form and pick your colours." },
  { n: "2", title: "Embed", desc: "Paste one snippet into your website." },
  { n: "3", title: "Collect", desc: "Watch responses land in your dashboard." },
];

function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return (
    <p
      className={`w-fit max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
        me ? "ml-auto bg-violet-500 text-white" : "bg-fg/10 text-fg"
      }`}
    >
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-20 pt-20 text-center">
        <span className="rounded-full border border-line bg-card px-4 py-1.5 text-xs text-muted">
          Forms that feel like conversations
        </span>
        <h1 className="mt-6 text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Build forms people <span className="text-accent">actually finish</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          Create a form, embed a chatbot widget on your website and manage every
          response from one dashboard.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a href="/signup" className="rounded-lg bg-violet-500 px-6 py-3 font-semibold text-white hover:bg-violet-600">
            Get started free
          </a>
          <a href="#demo" className="rounded-lg border border-line px-6 py-3 font-semibold hover:bg-fg/5">
            See the demo
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">Everything you need</h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-line bg-card p-6 transition hover:border-violet-400/60">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/15 text-accent">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">How it works</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-violet-400/50 bg-violet-500/10 font-bold text-accent">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      
<section id="demo" className="mx-auto max-w-md px-6 py-20 text-center">
  <h2 className="text-3xl font-bold tracking-tight">Try the chatbot</h2>
  <p className="mt-2 text-sm text-muted">
    This is a real form. Answer it and the response is saved.
  </p>
  <div id="formchat-inline" className="mt-8"></div>
</section>
      <Footer />
      <Script src="/widget.js" data-form="cbis5ed2" strategy="lazyOnload" />
      <Script src="http://localhost:3000/widget.js" data-form="cbis5ed2" data-mode="inline" data-target="#formchat-inline" data-height="600" defer />
    </main>
  );
}