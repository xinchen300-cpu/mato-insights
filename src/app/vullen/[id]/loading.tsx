/** While a round loads on a slow connection: its shape right away, so a tap on "Ga verder" never looks dead. */
export default function RoundLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-4 px-4 pt-4">
      <div className="skeleton h-6 w-24" />
      <div className="flex items-center gap-3.5">
        <div className="skeleton size-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="skeleton h-7 w-40" />
          <div className="skeleton h-4 w-52" />
        </div>
      </div>
      <div className="skeleton h-16 w-full rounded-2xl" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-[76px] w-full rounded-2xl" />
      ))}
    </main>
  );
}
