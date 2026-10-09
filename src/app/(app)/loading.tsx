/**
 * While a page loads: the shape of what is coming, in a calm shimmer, so the
 * screen never jumps from empty to full.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-64" />
      </div>
      <div className="surface-card flex flex-col gap-6 p-6 sm:p-8">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-12 w-56" />
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="skeleton h-3.5 w-20" />
              <div className="skeleton h-6 w-24" />
            </div>
          ))}
        </div>
        <div className="skeleton h-44 w-full" />
      </div>
      <div className="surface-card flex flex-col gap-1 p-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3.5 px-3 py-3">
            <div className="skeleton size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
