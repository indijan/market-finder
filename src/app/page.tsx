import { Suspense } from "react";
import { MarketExplorer } from "@/components/MarketExplorer";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-20 pt-14">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 p-10 shadow-2xl shadow-black/30">
          <div className="pointer-events-none absolute -right-24 top-10 h-64 w-64 rounded-full bg-emerald-400/20 blur-[90px]" />
          <div className="pointer-events-none absolute bottom-6 left-10 h-48 w-48 rounded-full bg-amber-300/20 blur-[80px]" />
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-[0.4em] text-amber-200/70">ClueMart</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-5xl">
              Új-zélandi piacok térképen, valódi dátumokkal.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate-200/80 md:text-lg">
              Google Places adatokból gyűjtjük a marketeket, és 30 napos dátumszűrővel,
              távolság alapú listával, valamint térkép-húzással böngészhetsz NZ-ben.
              A boltok külön kapcsolóval jeleníthetők meg.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.25em] text-slate-200/70">
              <span>Google Places</span>
              <span>-</span>
              <span>PostGIS radius</span>
              <span>-</span>
              <span>30 napos események</span>
            </div>
          </div>
        </section>

        <Suspense
          fallback={
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200/70">
              Loading markets...
            </div>
          }
        >
          <MarketExplorer />
        </Suspense>
      </main>
    </div>
  );
}
